import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppException } from '../../common/errors/app-exception.js';
import type { OtpPurpose } from '../../generated/prisma/client.js';
import { AuthErrorCode } from './auth-error-codes.js';
import { OTP_TTL_SECONDS } from './otp-codes.service.js';

const AUDIENCE = 'otp-verification';

export interface VerifiedOtp {
  otpId: string;
  destination: string;
  purpose: OtpPurpose;
}

/**
 * Short-lived JWT proving "this email was verified with purpose X".
 * Lets the app show the code screen and the PIN screen as two steps.
 * Single use: spending it marks OtpCode.consumedAt.
 */
@Injectable()
export class VerificationTokensService {
  constructor(private readonly jwt: JwtService) {}

  sign(verified: VerifiedOtp): { token: string; expiresInSec: number } {
    const token = this.jwt.sign(
      { dst: verified.destination, pur: verified.purpose },
      {
        subject: verified.otpId,
        audience: AUDIENCE,
        expiresIn: OTP_TTL_SECONDS,
      },
    );
    return { token, expiresInSec: OTP_TTL_SECONDS };
  }

  verify(token: string, expectedPurpose: OtpPurpose): VerifiedOtp {
    let payload: { sub?: string; dst?: string; pur?: string };
    try {
      payload = this.jwt.verify(token, { audience: AUDIENCE });
    } catch {
      throw this.invalid();
    }
    if (!payload.sub || !payload.dst || payload.pur !== expectedPurpose) {
      throw this.invalid();
    }
    return {
      otpId: payload.sub,
      destination: payload.dst,
      purpose: expectedPurpose,
    };
  }

  private invalid(): AppException {
    return new AppException(
      AuthErrorCode.VERIFICATION_TOKEN_INVALID,
      'Verification expired or invalid; verify the code again',
      HttpStatus.UNAUTHORIZED,
    );
  }
}
