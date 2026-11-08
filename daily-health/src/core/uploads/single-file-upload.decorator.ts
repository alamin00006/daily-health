/// <reference types="multer" />
import { applyDecorators, HttpStatus, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import { z } from 'zod';
import { AppException } from '../../common/errors/app-exception.js';
import { UploadErrorCode } from './upload-error-codes.js';
import { MAX_UPLOAD_BYTES } from './upload-limits.js';

/** A file multer kept in memory (`buffer` holds the bytes). */
export type UploadedMultipartFile = Express.Multer.File;

/** Multipart part that carries the file. */
export const UPLOAD_FILE_FIELD = 'file';

type SwaggerSchema = NonNullable<
  Extract<Parameters<typeof ApiBody>[0], { schema?: unknown }>['schema']
>;

/**
 * Upload pipeline step 1 (CLAUDE.md §5): multer keeps one file in memory,
 * capped at MAX_UPLOAD_BYTES (413 PAYLOAD_TOO_LARGE above it). Text fields
 * of the same multipart body arrive in @Body() and are validated with
 * `fieldsSchema`, which is also documented in Swagger.
 */
export const SingleFileUpload = (fieldsSchema?: z.ZodObject) => {
  const fieldsJsonSchema = fieldsSchema
    ? (z.toJSONSchema(fieldsSchema, {
        target: 'openapi-3.0',
        io: 'input',
        unrepresentable: 'any',
      }) as { properties?: Record<string, unknown>; required?: string[] })
    : {};

  return applyDecorators(
    UseInterceptors(
      FileInterceptor(UPLOAD_FILE_FIELD, {
        limits: {
          fileSize: MAX_UPLOAD_BYTES,
          files: 1,
          fields: 10,
          fieldSize: 4 * 1024,
          parts: 12,
        },
      }),
    ),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        required: [UPLOAD_FILE_FIELD, ...(fieldsJsonSchema.required ?? [])],
        properties: {
          [UPLOAD_FILE_FIELD]: { type: 'string', format: 'binary' },
          ...fieldsJsonSchema.properties,
        },
      } as SwaggerSchema,
    }),
  );
};

/** @UploadedFile() is undefined when the `file` part is missing. */
export function requireUploadedFile(
  file: UploadedMultipartFile | undefined,
): UploadedMultipartFile {
  if (!file || file.size === 0) {
    throw new AppException(
      UploadErrorCode.FILE_REQUIRED,
      `Attach the file in the "${UPLOAD_FILE_FIELD}" field`,
      HttpStatus.BAD_REQUEST,
    );
  }
  return file;
}
