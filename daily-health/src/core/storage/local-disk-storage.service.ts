import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service.js';
import {
  StorageService,
  type FileUrlOptions,
  type FileVisibility,
  type SaveFileInput,
} from './storage.service.js';

/** `<visibility>/<yyyy>/<mm>/<file>`; only URL-safe characters, no `..`. */
const STORAGE_KEY_PATTERN =
  /^(public|private)(\/[A-Za-z0-9_-][A-Za-z0-9._-]*)+$/;
const EXTENSION_PATTERN = /^[a-z0-9]{1,10}$/;

/**
 * Files on the VPS disk under STORAGE_ROOT_DIR/{public,private}, served by Nginx
 * (docker/nginx/templates/file-server.conf.template).
 *
 * Private URLs use Nginx `secure_link`:
 *   md5 = base64url(md5("<expires><uri> <secret>")), sent as ?md5=&expires=
 */
@Injectable()
export class LocalDiskStorageService extends StorageService {
  private readonly rootDir: string;
  private readonly settings: AppConfigService['storage'];

  constructor(config: AppConfigService) {
    super();
    this.settings = config.storage;
    this.rootDir = path.resolve(this.settings.rootDir);
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

    await this.writeAtomically(this.pathFor(storageKey), data);
    return storageKey;
  }

  async saveAtKey(storageKey: string, data: Buffer): Promise<void> {
    await this.writeAtomically(this.pathFor(storageKey), data);
  }

  /** Write to a temp file first, so Nginx never serves a half-written file. */
  private async writeAtomically(filePath: string, data: Buffer): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(tempPath, data, { flag: 'wx' });
      await rename(tempPath, filePath);
    } catch (error) {
      await rm(tempPath, { force: true });
      throw error;
    }
  }

  getUrl(storageKey: string, options: FileUrlOptions = {}): string {
    const visibility = this.visibilityOf(storageKey);
    const baseUrl =
      visibility === 'public'
        ? this.settings.publicBaseUrl
        : this.settings.privateBaseUrl;
    const url = new URL(
      storageKey,
      baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`,
    );
    if (visibility === 'public') return url.toString();

    const ttl = options.expiresInSeconds ?? this.settings.privateUrlTtlSeconds;
    const expires = Math.floor(Date.now() / 1000) + ttl;
    const signature = createHash('md5')
      .update(`${expires}${url.pathname} ${this.settings.urlSigningSecret}`)
      .digest('base64url');
    url.searchParams.set('md5', signature);
    url.searchParams.set('expires', String(expires));
    return url.toString();
  }

  async delete(storageKey: string): Promise<void> {
    await rm(this.pathFor(storageKey), { force: true });
  }

  private visibilityOf(storageKey: string): FileVisibility {
    this.assertValidKey(storageKey);
    return storageKey.startsWith('public/') ? 'public' : 'private';
  }

  private pathFor(storageKey: string): string {
    this.assertValidKey(storageKey);
    const filePath = path.resolve(this.rootDir, ...storageKey.split('/'));
    // Defence in depth: the key pattern already forbids traversal.
    if (!filePath.startsWith(this.rootDir + path.sep)) {
      throw new Error('Storage key resolves outside the storage root');
    }
    return filePath;
  }

  private assertValidKey(storageKey: string): void {
    if (!STORAGE_KEY_PATTERN.test(storageKey)) {
      throw new Error('Invalid storage key');
    }
  }
}
