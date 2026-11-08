import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service.js';
import {
  StorageService,
  thumbnailStorageKey,
  type FileVisibility,
} from '../storage/storage.service.js';
import type { ProcessedUpload } from './uploaded-file-processor.service.js';
import { THUMBNAIL_WIDTHS, type ThumbnailWidth } from './upload-limits.js';

export interface StoredFileUrls {
  /** The stored file itself (WebP or PDF). */
  url: string;
  /** 200px WebP; null for PDFs. */
  thumbnailUrl: string | null;
  /** 800px WebP; null for PDFs. */
  previewUrl: string | null;
}

/**
 * Saves a processed upload and its thumbnails through StorageService, and
 * builds their URLs at response time. Callers check permissions first.
 */
@Injectable()
export class StoredUploadsService {
  constructor(
    private readonly storage: StorageService,
    private readonly config: AppConfigService,
  ) {}

  /** When private URLs built now stop working (for the app to refetch before). */
  privateUrlsExpireAt(): Date {
    return new Date(
      Date.now() + this.config.storage.privateUrlTtlSeconds * 1000,
    );
  }

  /** Returns the storageKey of the main file. Nothing is left behind on failure. */
  async store(
    upload: ProcessedUpload,
    visibility: FileVisibility,
  ): Promise<string> {
    const storageKey = await this.storage.save({
      visibility,
      data: upload.data,
      extension: upload.extension,
    });
    try {
      await Promise.all(
        upload.thumbnails.map((thumbnail) =>
          this.storage.saveAtKey(
            thumbnailStorageKey(storageKey, thumbnail.width),
            thumbnail.data,
          ),
        ),
      );
    } catch (error) {
      await this.remove(storageKey, upload.mimeType);
      throw error;
    }
    return storageKey;
  }

  /** Deletes the file and its thumbnails. Idempotent. */
  async remove(storageKey: string, mimeType: string): Promise<void> {
    await Promise.all(
      [storageKey, ...this.thumbnailKeys(storageKey, mimeType)].map((key) =>
        this.storage.delete(key),
      ),
    );
  }

  urls(storageKey: string, mimeType: string): StoredFileUrls {
    const hasThumbnails = isImage(mimeType);
    return {
      url: this.storage.getUrl(storageKey),
      thumbnailUrl: hasThumbnails ? this.thumbnailUrl(storageKey, 200) : null,
      previewUrl: hasThumbnails ? this.thumbnailUrl(storageKey, 800) : null,
    };
  }

  thumbnailUrl(storageKey: string, width: ThumbnailWidth): string {
    return this.storage.getUrl(thumbnailStorageKey(storageKey, width));
  }

  private thumbnailKeys(storageKey: string, mimeType: string): string[] {
    if (!isImage(mimeType)) return [];
    return THUMBNAIL_WIDTHS.map((width) =>
      thumbnailStorageKey(storageKey, width),
    );
  }
}

function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}
