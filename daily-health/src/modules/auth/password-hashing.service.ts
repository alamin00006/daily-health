import { Injectable, type OnModuleInit } from '@nestjs/common';
import argon2 from 'argon2';

/**
 * argon2id with OWASP's minimum profile (19 MiB, t=2, p=1): strong enough for a
 * login password behind an account lockout, and light enough for a small VPS.
 */
const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordHashingService implements OnModuleInit {
  /** Verified against when the account does not exist, so timing does not reveal it. */
  private dummyHash = '';

  async onModuleInit(): Promise<void> {
    this.dummyHash = await argon2.hash('not-a-real-password', HASH_OPTIONS);
  }

  hash(password: string): Promise<string> {
    return argon2.hash(password, HASH_OPTIONS);
  }

  async verify(passwordHash: string | null, password: string): Promise<boolean> {
    if (!passwordHash) {
      await argon2.verify(this.dummyHash, password);
      return false;
    }
    return argon2.verify(passwordHash, password);
  }
}
