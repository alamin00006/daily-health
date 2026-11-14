import { createHash, createHmac, randomUUID } from 'node:crypto';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service.js';
import {
  StorageService,
  type FileUrlOptions,
  type FileVisibility,
  type SaveFileInput,
} from './storage.service.js';

/** `<visibility>/<yyyy>/<mm>/<file>`; only URL-safe characters, no `..`. */
const STORAGE_KEY_PATTERN = /^(public|private)(\/[A-Za-z0-9_-][A-Za-z0-9._-]*)+$/;
const EXTENSION_PATTERN = /^[a-z0-9]{1,10}$/;

/** Keys are never reused (a new upload gets a new uuid), so public files can be cached forever. */
const PUBLIC_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const PRIVATE_CACHE_CONTROL = 'private, no-store';

const CONTENT_TYPES: Record<string, string> = {
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  pdf: 'application/pdf',
};

/**
 * Files in an S3-compatible object store: Cloudflare R2 today, AWS S3 by setting
 * STORAGE_PROVIDER=S3 (+ its region, keys and buckets) and restarting. No code change.
 *
 * Two buckets:
 * - public: `public/...` keys, served from the bucket's CDN domain (PUBLIC_FILES_BASE_URL:
 *   the R2 custom domain, or CloudFront in front of S3).
 * - private: `private/...` keys, read only through short-lived presigned URLs.
 *
 * The storageKey is the object key in its bucket, so the DB stays the same whatever hosts it;
 * moving providers is copying both buckets (rclone) and switching the env.
 * Presigned URLs are signed here (SigV4, query string) so getUrl stays synchronous.
 */
@Injectable()
export class S3CompatibleStorageService extends StorageService implements OnModuleDestroy {
  private readonly settings: AppConfigService['storage'];
  private readonly client: S3Client;

  constructor(config: AppConfigService) {
    super();
    this.settings = config.storage;
    this.client = new S3Client({
      region: this.settings.region,
      endpoint: this.settings.endpoint,
      forcePathStyle: this.settings.forcePathStyle,
      credentials: {
        accessKeyId: this.settings.accessKeyId,
        secretAccessKey: this.settings.secretAccessKey,
      },
    });
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }

  async save({ visibility, data, extension }: SaveFileInput): Promise<string> {
    if (!EXTENSION_PATTERN.test(extension)) {
      throw new Error(`Invalid file extension: ${extension}`);
    }
    const now = new Date();
    const storageKey = [
      visibility,
      String(now.getUTCFullYear()),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      `${randomUUID()}.${extension}`,
    ].join('/');
    await this.put(storageKey, data);
    return storageKey;
  }

  async saveAtKey(storageKey: string, data: Buffer): Promise<void> {
    await this.put(storageKey, data);
  }

  getUrl(storageKey: string, options: FileUrlOptions = {}): string {
    if (this.visibilityOf(storageKey) === 'public') {
      const base = this.settings.publicBaseUrl.replace(/\/+$/, '');
      return `${base}/${encodeKey(storageKey)}`;
    }
    return this.presignGet(storageKey, options.expiresInSeconds ?? this.settings.privateUrlTtlSeconds);
  }

  async delete(storageKey: string): Promise<void> {
    // S3 DeleteObject succeeds for a missing key too, so this is idempotent.
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucketFor(storageKey), Key: storageKey }),
    );
  }

  // -------------------------------------------------------------------------

  private async put(storageKey: string, data: Buffer): Promise<void> {
    const visibility = this.visibilityOf(storageKey);
    const extension = storageKey.slice(storageKey.lastIndexOf('.') + 1).toLowerCase();
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketFor(storageKey),
        Key: storageKey,
        Body: data,
        ContentType: CONTENT_TYPES[extension] ?? 'application/octet-stream',
        CacheControl: visibility === 'public' ? PUBLIC_CACHE_CONTROL : PRIVATE_CACHE_CONTROL,
      }),
    );
  }

  /**
   * Presigned GET of a private file:
   * - path style (R2): https://<account>.r2.cloudflarestorage.com/<bucket>/<key>?X-Amz-…
   * - virtual-hosted (S3): https://<bucket>.s3.<region>.amazonaws.com/<key>?X-Amz-…
   */
  private presignGet(storageKey: string, expiresInSeconds: number, now = new Date()): string {
    const endpoint = new URL(this.settings.endpoint);
    const base = endpoint.pathname.replace(/\/+$/, '');
    const bucket = this.settings.privateBucket;
    const [origin, path] = this.settings.forcePathStyle
      ? [endpoint.origin, `${base}/${encodeSegment(bucket)}/${encodeKey(storageKey)}`]
      : [`${endpoint.protocol}//${bucket}.${endpoint.host}`, `${base}/${encodeKey(storageKey)}`];
    return presignS3Get({
      origin,
      path,
      region: this.settings.region,
      accessKeyId: this.settings.accessKeyId,
      secretAccessKey: this.settings.secretAccessKey,
      expiresInSeconds,
      now,
    });
  }

  private bucketFor(storageKey: string): string {
    return this.visibilityOf(storageKey) === 'public'
      ? this.settings.publicBucket
      : this.settings.privateBucket;
  }

  private visibilityOf(storageKey: string): FileVisibility {
    if (!STORAGE_KEY_PATTERN.test(storageKey)) throw new Error('Invalid storage key');
    return storageKey.startsWith('public/') ? 'public' : 'private';
  }
}

/**
 * AWS Signature V4 presigned GET (query-string auth, only the host header signed), as both
 * R2 and S3 accept it
 * (https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html).
 * `path` must already be URI-encoded. Exported for checking against AWS's documented example.
 */
export function presignS3Get(input: {
  origin: string;
  path: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresInSeconds: number;
  now: Date;
}): string {
  const host = new URL(input.origin).host;
  const amzDate = input.now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${input.region}/s3/aws4_request`;

  const canonicalQuery = (
    [
      ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
      ['X-Amz-Credential', `${input.accessKeyId}/${scope}`],
      ['X-Amz-Date', amzDate],
      ['X-Amz-Expires', String(input.expiresInSeconds)],
      ['X-Amz-SignedHeaders', 'host'],
    ] as const
  )
    .map(([k, v]) => [encodeSegment(k), encodeSegment(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  const canonicalRequest = [
    'GET',
    input.path,
    canonicalQuery,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const kDate = hmac(`AWS4${input.secretAccessKey}`, dateStamp);
  const kSigning = hmac(hmac(hmac(kDate, input.region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  return `${input.origin}${input.path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

/** RFC 3986 encoding, as SigV4 wants it (encodeURIComponent leaves !'()* alone). */
function encodeSegment(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodeKey(storageKey: string): string {
  return storageKey.split('/').map(encodeSegment).join('/');
}
