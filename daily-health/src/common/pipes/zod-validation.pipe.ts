import { HttpStatus, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { AppException } from '../errors/app-exception.js';
import { ErrorCode } from '../errors/error-codes.js';

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

/**
 * Validates a body/query/param against a zod contract (from packages/shared later).
 * Usage: `@Body(new ZodValidationPipe(createVitalSchema)) body: CreateVital`.
 * Issue details carry the field path and rule only, never the submitted value.
 */
export class ZodValidationPipe<
  TSchema extends z.ZodType,
> implements PipeTransform<unknown, z.output<TSchema>> {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.output<TSchema> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const issues: ValidationIssue[] = result.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      code: issue.code,
      message: issue.message,
    }));
    throw new AppException(
      ErrorCode.VALIDATION_FAILED,
      'Request validation failed',
      HttpStatus.BAD_REQUEST,
      { issues },
    );
  }
}
