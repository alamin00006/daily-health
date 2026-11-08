import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_VERSION_BYTES = 1;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const HEADER_BYTES = KEY_VERSION_BYTES + IV_BYTES + AUTH_TAG_BYTES;

/**
 * Application-level encryption for `enc` columns (erd.md → "এনক্রিপশন").
 *
 * Stored value (Prisma `Bytes` / Postgres `bytea`):
 *   [key version: 1 byte][IV: 12 bytes][GCM auth tag: 16 bytes][ciphertext]
 *
 * - A fresh random IV per value.
 * - `context` (e.g. "health.MedicalCondition.name") is bound as GCM AAD, so a
 *   ciphertext copied into a different column fails to decrypt.
 * - The key version prefix allows key rotation: add a new key to
 *   ENCRYPTION_KEYS, switch ENCRYPTION_ACTIVE_KEY_VERSION, and re-encrypt rows
 *   where needsReEncryption() is true.
 */
@Injectable()
export class ColumnEncryptionService {
  private readonly keys: ReadonlyMap<number, Buffer>;
  private readonly activeKeyVersion: number;

  constructor(config: AppConfigService) {
    ({ keys: this.keys, activeKeyVersion: this.activeKeyVersion } =
      config.encryption);
  }

  encrypt(plaintext: string, context: string): Uint8Array<ArrayBuffer> {
    const key = this.keyFor(this.activeKeyVersion);
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_BYTES,
    });
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const out = new Uint8Array(HEADER_BYTES + ciphertext.length);
    out[0] = this.activeKeyVersion;
    out.set(iv, KEY_VERSION_BYTES);
    out.set(cipher.getAuthTag(), KEY_VERSION_BYTES + IV_BYTES);
    out.set(ciphertext, HEADER_BYTES);
    return out;
  }

  decrypt(stored: Uint8Array, context: string): string {
    if (stored.length < HEADER_BYTES) {
      throw new Error('Encrypted value is too short');
    }
    const data = Buffer.from(stored.buffer, stored.byteOffset, stored.length);
    const key = this.keyFor(data[0]);
    const iv = data.subarray(KEY_VERSION_BYTES, KEY_VERSION_BYTES + IV_BYTES);
    const authTag = data.subarray(KEY_VERSION_BYTES + IV_BYTES, HEADER_BYTES);

    const decipher = createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_BYTES,
    });
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(data.subarray(HEADER_BYTES)),
      decipher.final(),
    ]).toString('utf8');
  }

  encryptNullable(
    plaintext: string | null | undefined,
    context: string,
  ): Uint8Array<ArrayBuffer> | null {
    return plaintext == null ? null : this.encrypt(plaintext, context);
  }

  decryptNullable(
    stored: Uint8Array | null | undefined,
    context: string,
  ): string | null {
    return stored == null ? null : this.decrypt(stored, context);
  }

  /** For jsonb-like values stored encrypted (e.g. DailyLog.symptoms). */
  encryptJson(value: unknown, context: string): Uint8Array<ArrayBuffer> {
    return this.encrypt(JSON.stringify(value), context);
  }

  decryptJson<T>(stored: Uint8Array, context: string): T {
    return JSON.parse(this.decrypt(stored, context)) as T;
  }

  /** True when the value was encrypted with an older key version. */
  needsReEncryption(stored: Uint8Array): boolean {
    return stored[0] !== this.activeKeyVersion;
  }

  private keyFor(version: number | undefined): Buffer {
    const key = version === undefined ? undefined : this.keys.get(version);
    if (!key) {
      throw new Error(`Unknown encryption key version: ${String(version)}`);
    }
    return key;
  }
}
