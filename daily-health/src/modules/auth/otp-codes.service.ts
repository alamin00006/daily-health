import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception.js';
import { AppConfigService } from '../../core/config/app-config.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { OtpChannel, OtpPurpose } from '../../generated/prisma/client.js';
import { AuthErrorCode } from './auth-error-codes.js';

export const OTP_TTL_SECONDS = 10 * 60;
export const OTP_RESEND_AFTER_SECONDS = 60;
const OTP_MAX_SENDS_PER_HOUR = 5;
const OTP_MAX_VERIFY_ATTEMPTS = 5;

export interface IssuedOtp {
  code: string;
  expiresInSec: number;
  resendAfterSec: number;
}

/**
 * One-time codes per (destination, purpose). Only the newest code is valid.
 * Stored as HMAC-SHA256(OTP_HASH_SECRET, ...), never in plain text.
 *
 * Limits per destination: one code per minute, 5 per hour, 5 wrong tries per code.
 */
@Injectable()
export class OtpCodesService {
  private readonly hashSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    config: AppConfigService,
  ) {
    this.hashSecret = config.auth.otpHashSecret;
  }

  async issue(
    channel: OtpChannel,
    destination: string,
    purpose: OtpPurpose,
  ): Promise<IssuedOtp> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Serialise sends for one destination+purpose so the limits cannot be raced.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`otp:${purpose}:${destination}`}, 0))`;

      const recent = await tx.otpCode.findMany({
        where: {
          destination,
          purpose,
          createdAt: { gt: new Date(now.getTime() - 3_600_000) },
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });

      const newest = recent[0];
      if (newest) {
        const sinceLastSec =
          (now.getTime() - newest.createdAt.getTime()) / 1000;
        if (sinceLastSec < OTP_RESEND_AFTER_SECONDS) {
          throw new AppException(
            AuthErrorCode.OTP_RESEND_TOO_SOON,
            'Wait before requesting another code',
            HttpStatus.TOO_MANY_REQUESTS,
            {
              retryAfterSec: Math.ceil(OTP_RESEND_AFTER_SECONDS - sinceLastSec),
            },
          );
        }
      }
      if (recent.length >= OTP_MAX_SENDS_PER_HOUR) {
        const oldest = recent[recent.length - 1]!;
        throw new AppException(
          AuthErrorCode.OTP_SEND_LIMIT_REACHED,
          'Too many codes requested; try again later',
          HttpStatus.TOO_MANY_REQUESTS,
          {
            retryAfterSec: Math.ceil(
              (oldest.createdAt.getTime() + 3_600_000 - now.getTime()) / 1000,
            ),
          },
        );
      }

      // Older codes stop working once a new one is sent.
      await tx.otpCode.updateMany({
        where: { destination, purpose, usedAt: null },
        data: { usedAt: now },
      });
      await tx.otpCode.create({
        data: {
          channel,
          destination,
          purpose,
          codeHash: this.hashCode(destination, purpose, code),
          expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
        },
      });
    });

    return {
      code,
      expiresInSec: OTP_TTL_SECONDS,
      resendAfterSec: OTP_RESEND_AFTER_SECONDS,
    };
  }

  /** Checks the code and marks it used. Returns the OtpCode id. */
  async verify(
    destination: string,
    purpose: OtpPurpose,
    code: string,
  ): Promise<string> {
    const otp = await this.prisma.otpCode.findFirst({
      where: {
        destination,
        purpose,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) {
      throw new AppException(
        AuthErrorCode.OTP_EXPIRED,
        'No valid code; request a new one',
      );
    }
    if (otp.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
      throw this.tooManyAttempts();
    }

    const expected = Buffer.from(otp.codeHash, 'hex');
    const actual = Buffer.from(
      this.hashCode(destination, purpose, code),
      'hex',
    );
    if (!timingSafeEqual(expected, actual)) {
      const { attempts } = await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
        select: { attempts: true },
      });
      const attemptsLeft = Math.max(0, OTP_MAX_VERIFY_ATTEMPTS - attempts);
      if (attemptsLeft === 0) throw this.tooManyAttempts();
      throw new AppException(
        AuthErrorCode.OTP_INVALID,
        'Wrong code',
        HttpStatus.BAD_REQUEST,
        { attemptsLeft },
      );
    }

    // Conditional update: two parallel verifies of the same code cannot both win.
    const { count } = await this.prisma.otpCode.updateMany({
      where: { id: otp.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count === 0) {
      throw new AppException(AuthErrorCode.OTP_EXPIRED, 'Code already used');
    }
    return otp.id;
  }

  /**
   * Spends the verification issued for a verified code (single use).
   * Runs inside the caller's transaction, so a failed signup does not burn it.
   */
  async consumeVerification(
    tx: Pick<PrismaService, 'otpCode'>,
    otpId: string,
    destination: string,
    purpose: OtpPurpose,
  ): Promise<void> {
    const { count } = await tx.otpCode.updateMany({
      where: {
        id: otpId,
        destination,
        purpose,
        usedAt: { not: null },
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });
    if (count === 0) {
      throw new AppException(
        AuthErrorCode.VERIFICATION_TOKEN_INVALID,
        'Verification already used or invalid',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  private hashCode(
    destination: string,
    purpose: OtpPurpose,
    code: string,
  ): string {
    return createHmac('sha256', this.hashSecret)
      .update(`${purpose}:${destination}:${code}`)
      .digest('hex');
  }

  private tooManyAttempts(): AppException {
    return new AppException(
      AuthErrorCode.OTP_TOO_MANY_ATTEMPTS,
      'Too many wrong codes; request a new one',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
