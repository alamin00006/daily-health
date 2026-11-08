import { HttpStatus, Injectable } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { AppException } from '../../common/errors/app-exception.js';
import { UploadErrorCode } from './upload-error-codes.js';
import {
  AVATAR_DIMENSION,
  MAX_INPUT_PIXELS,
  MAX_STORED_IMAGE_DIMENSION,
  THUMBNAIL_WIDTHS,
  type ThumbnailWidth,
} from './upload-limits.js';

/** Decoded image formats we accept. HEIC is not: the app sends JPEG after resizing. */
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PDF_TYPE = 'application/pdf';

// Uploaded images are almost never processed twice; the cache only costs RAM.
sharp.cache(false);

export interface ProcessedImage {
  kind: 'image';
  data: Buffer;
  mimeType: 'image/webp';
  extension: 'webp';
  thumbnails: { width: ThumbnailWidth; data: Buffer }[];
}

export interface ProcessedPdf {
  kind: 'pdf';
  data: Buffer;
  mimeType: 'application/pdf';
  extension: 'pdf';
  thumbnails: [];
}

export type ProcessedUpload = ProcessedImage | ProcessedPdf;

export interface ProcessUploadOptions {
  /** Lab reports may be PDFs; profile photos may not. */
  allowPdf: boolean;
  /** Crop images to an AVATAR_DIMENSION square (profile photos). */
  avatar?: boolean;
}

/**
 * Upload pipeline step 2 and 3 (CLAUDE.md §5): the type comes from the file's
 * magic bytes, never from its name or Content-Type; images are re-encoded to
 * WebP with thumbnails. Re-encoding drops EXIF/GPS (sharp's default; never
 * call withMetadata()) after applying the EXIF rotation.
 */
@Injectable()
export class UploadedFileProcessorService {
  async process(
    buffer: Buffer,
    options: ProcessUploadOptions,
  ): Promise<ProcessedUpload> {
    const detected = await fileTypeFromBuffer(buffer);

    if (detected && ACCEPTED_IMAGE_TYPES.has(detected.mime)) {
      return this.processImage(buffer, options.avatar ?? false);
    }
    if (detected?.mime === PDF_TYPE && options.allowPdf) {
      return {
        kind: 'pdf',
        data: buffer,
        mimeType: PDF_TYPE,
        extension: 'pdf',
        thumbnails: [],
      };
    }
    throw new AppException(
      UploadErrorCode.UNSUPPORTED_FILE_TYPE,
      options.allowPdf
        ? 'Only JPEG, PNG, WebP images or PDF files are accepted'
        : 'Only JPEG, PNG or WebP images are accepted',
      HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    );
  }

  private async processImage(
    buffer: Buffer,
    avatar: boolean,
  ): Promise<ProcessedImage> {
    try {
      // rotate() with no angle applies the EXIF orientation before EXIF is dropped.
      const source = sharp(buffer, {
        limitInputPixels: MAX_INPUT_PIXELS,
        failOn: 'error',
      }).rotate();

      const resized = avatar
        ? source.resize({
            width: AVATAR_DIMENSION,
            height: AVATAR_DIMENSION,
            fit: 'cover',
            position: 'attention',
          })
        : source.resize({
            width: MAX_STORED_IMAGE_DIMENSION,
            height: MAX_STORED_IMAGE_DIMENSION,
            fit: 'inside',
            withoutEnlargement: true,
          });
      const data = await resized.webp({ quality: 80 }).toBuffer();

      const thumbnails = await Promise.all(
        THUMBNAIL_WIDTHS.map(async (width) => ({
          width,
          data: await sharp(data)
            .resize({
              width,
              height: width,
              fit: 'inside',
              withoutEnlargement: true,
            })
            .webp({ quality: 75 })
            .toBuffer(),
        })),
      );

      return {
        kind: 'image',
        data,
        mimeType: 'image/webp',
        extension: 'webp',
        thumbnails,
      };
    } catch {
      // sharp's message may describe the input; keep the response generic.
      throw new AppException(
        UploadErrorCode.INVALID_FILE,
        'The image is damaged or too large to process',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }
}
