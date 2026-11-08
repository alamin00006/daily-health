import { Injectable, type OnModuleInit } from '@nestjs/common';
import argon2 from 'argon2';

/**
 * argon2id with OWASP's minimum profile (19 MiB, t=2, p=1): strong enough for
 * a 6-digit PIN behind an account lockout, and light enough for a small VPS.
 */
const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PinHashingService implements OnModuleInit {
  /** Verified against when the account does not exist, so timing does not reveal it. */
  private dummyHash = '';

  async onModuleInit(): Promise<void> {
    this.dummyHash = await argon2.hash('000000', HASH_OPTIONS);
  }

  hash(pin: string): Promise<string> {
    return argon2.hash(pin, HASH_OPTIONS);
  }

  async verify(pinHash: string | null, pin: string): Promise<boolean> {
    if (!pinHash) {
      await argon2.verify(this.dummyHash, pin);
      return false;
    }
    return argon2.verify(pinHash, pin);
  }
}
