/**
 * `public`: the public bucket, served from its CDN domain with long cache headers
 *   (health tip images, product pictures, avatars of doctors).
 * `private`: lab reports, prescriptions, patient photos; served only via expiring signed URLs.
 */
export type FileVisibility = 'public' | 'private';

export interface SaveFileInput {
  visibility: FileVisibility;
  data: Buffer;
  /** Lowercase extension without the dot, e.g. "webp", "pdf". */
  extension: string;
}

/**
 * Key of a WebP thumbnail of an image:
 * `private/2026/11/<uuid>.webp` → `private/thumbs/200/2026/11/<uuid>.webp`.
 * The visibility stays first, so a thumbnail is served (and signed) like its original.
 */
export function thumbnailStorageKey(storageKey: string, width: number): string {
  const [visibility, ...rest] = storageKey.split('/');
  const fileName = rest.pop();
  if (!visibility || !fileName || !Number.isInteger(width) || width <= 0) {
    throw new Error('Invalid storage key or thumbnail width');
  }
  const baseName = fileName.replace(/\.[a-z0-9]+$/, '');
  return [
    visibility,
    'thumbs',
    String(width),
    ...rest,
    `${baseName}.webp`,
  ].join('/');
}

export interface FileUrlOptions {
  /** Private files only. Defaults to PRIVATE_FILE_URL_TTL_SECONDS. */
  expiresInSeconds?: number;
}

/**
 * The only way the app touches files (CLAUDE.md §5). The DB stores just the
 * returned `storageKey` (e.g. `private/2026/11/<uuid>.webp`), never a URL, so
 * the host (Cloudflare R2 today, AWS S3 by env) can change with no data change.
 *
 * Abstract class (not an interface) so it can be the Nest injection token.
 * Callers must check permissions before asking for a private URL.
 */
export abstract class StorageService {
  /** Stores the file and returns its new storageKey. */
  abstract save(input: SaveFileInput): Promise<string>;

  /**
   * Stores a file at a key derived from another one (thumbnails, see
   * thumbnailStorageKey). Overwrites an existing file at that key.
   */
  abstract saveAtKey(storageKey: string, data: Buffer): Promise<void>;

  /** Builds the URL at response time; signed and expiring for private files. */
  abstract getUrl(storageKey: string, options?: FileUrlOptions): string;

  /** Idempotent: deleting a missing file is not an error. */
  abstract delete(storageKey: string): Promise<void>;
}
