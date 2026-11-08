import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception.js';
import { EmailOutboxService } from '../../core/mail/email-outbox.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { User } from '../../generated/prisma/client.js';
import type {
  AuthTokensResponse,
  OtpPurpose,
  SendOtpResponse,
  VerifyOtpResponse,
} from '../../shared-contracts/auth.contract.js';
import type { DeviceInfo } from '../../shared-contracts/common-fields.contract.js';
import {
  accountAlreadyExistsEmail,
  otpCodeEmail,
} from './auth-email-templates.js';
import { AuthErrorCode } from './auth-error-codes.js';
import { AuthSessionsService } from './auth-sessions.service.js';
import { OTP_TTL_SECONDS, OtpCodesService } from './otp-codes.service.js';
import { PinHashingService } from './pin-hashing.service.js';
import { VerificationTokensService } from './verification-tokens.service.js';

/** Wrong PINs in a row before login locks. Every further block of 5 doubles the lock. */
const PIN_ATTEMPTS_BEFORE_LOCK = 5;
const PIN_LOCK_BASE_MS = 15 * 60_000;
const PIN_LOCK_MAX_MS = 24 * 3_600_000;

/**
 * Email-based auth (phone/SMS comes later):
 *   signup:      otp/send(SIGNUP) → otp/verify → signup(token, PIN)
 *   login:       login(email, PIN)  or  otp/send(LOGIN) → otp/verify → login/otp(token)
 *   forgot PIN:  otp/send(RESET_PIN) → otp/verify → pin/reset(token, new PIN)
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otpCodes: OtpCodesService,
    private readonly verificationTokens: VerificationTokensService,
    private readonly sessions: AuthSessionsService,
    private readonly pins: PinHashingService,
    private readonly emails: EmailOutboxService,
  ) {}

  /**
   * Answers the same way whether or not the email has an account, so the
   * endpoint cannot be used to find out who is registered. A code is always
   * issued (same limits for everyone) but only emailed when it is usable.
   */
  async sendOtp(email: string, purpose: OtpPurpose): Promise<SendOtpResponse> {
    const issued = await this.otpCodes.issue('EMAIL', email, purpose);
    const account = await this.findRegisteredByEmail(email);

    if (purpose === 'SIGNUP') {
      await this.emails.enqueue(
        account
          ? accountAlreadyExistsEmail(email)
          : otpCodeEmail(email, purpose, issued.code, OTP_TTL_SECONDS / 60),
      );
    } else if (account && account.status === 'ACTIVE') {
      await this.emails.enqueue(
        otpCodeEmail(email, purpose, issued.code, OTP_TTL_SECONDS / 60),
      );
    }

    return {
      expiresInSec: issued.expiresInSec,
      resendAfterSec: issued.resendAfterSec,
    };
  }

  async verifyOtp(
    email: string,
    purpose: OtpPurpose,
    code: string,
  ): Promise<VerifyOtpResponse> {
    const otpId = await this.otpCodes.verify(email, purpose, code);
    const { token, expiresInSec } = this.verificationTokens.sign({
      otpId,
      destination: email,
      purpose,
    });
    return { verificationToken: token, expiresInSec };
  }

  async signup(
    verificationToken: string,
    pin: string,
    device: DeviceInfo,
  ): Promise<AuthTokensResponse> {
    const verified = this.verificationTokens.verify(
      verificationToken,
      'SIGNUP',
    );
    const pinHash = await this.pins.hash(pin);

    return this.prisma.$transaction(async (tx) => {
      await this.otpCodes.consumeVerification(
        tx,
        verified.otpId,
        verified.destination,
        'SIGNUP',
      );
      const existing = await tx.user.findUnique({
        where: { email: verified.destination },
        select: { id: true },
      });
      if (existing) {
        throw new AppException(
          AuthErrorCode.EMAIL_ALREADY_REGISTERED,
          'An account with this email already exists',
          HttpStatus.CONFLICT,
        );
      }

      const now = new Date();
      const user = await tx.user.create({
        data: {
          email: verified.destination,
          emailVerifiedAt: now,
          pinHash,
          lastLoginAt: now,
        },
      });
      return this.sessions.startSession(user, device, tx);
    });
  }

  async loginWithPin(
    email: string,
    pin: string,
    device: DeviceInfo,
  ): Promise<AuthTokensResponse> {
    const user = await this.findRegisteredByEmail(email);
    if (!user) {
      await this.pins.verify(null, pin);
      throw invalidCredentials();
    }

    await this.assertPinNotLocked(user);
    if (!(await this.pins.verify(user.pinHash, pin))) {
      await this.recordWrongPin(user.id);
      throw invalidCredentials();
    }
    assertActive(user);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: user.id },
        data: {
          failedPinAttempts: 0,
          pinLockedUntil: null,
          lastLoginAt: new Date(),
        },
      });
      return this.sessions.startSession(updated, device, tx);
    });
  }

  async loginWithOtp(
    verificationToken: string,
    device: DeviceInfo,
  ): Promise<AuthTokensResponse> {
    const verified = this.verificationTokens.verify(verificationToken, 'LOGIN');

    return this.prisma.$transaction(async (tx) => {
      await this.otpCodes.consumeVerification(
        tx,
        verified.otpId,
        verified.destination,
        'LOGIN',
      );
      const user = await tx.user.findUnique({
        where: { email: verified.destination },
      });
      if (!user || user.isGuest) throw invalidCredentials();
      assertActive(user);

      // Proving the email also clears a PIN lockout.
      const updated = await tx.user.update({
        where: { id: user.id },
        data: {
          failedPinAttempts: 0,
          pinLockedUntil: null,
          lastLoginAt: new Date(),
        },
      });
      return this.sessions.startSession(updated, device, tx);
    });
  }

  /** Sets a new PIN and signs out every other device. */
  async resetPin(
    verificationToken: string,
    newPin: string,
    device: DeviceInfo,
  ): Promise<AuthTokensResponse> {
    const verified = this.verificationTokens.verify(
      verificationToken,
      'RESET_PIN',
    );
    const pinHash = await this.pins.hash(newPin);

    return this.prisma.$transaction(async (tx) => {
      await this.otpCodes.consumeVerification(
        tx,
        verified.otpId,
        verified.destination,
        'RESET_PIN',
      );
      const user = await tx.user.findUnique({
        where: { email: verified.destination },
      });
      if (!user || user.isGuest) throw invalidCredentials();
      assertActive(user);

      const updated = await tx.user.update({
        where: { id: user.id },
        data: {
          pinHash,
          failedPinAttempts: 0,
          pinLockedUntil: null,
          lastLoginAt: new Date(),
        },
      });
      await this.sessions.revokeAllSessions(user.id, { tx });
      return this.sessions.startSession(updated, device, tx);
    });
  }

  /** Logged-in PIN change. Other devices are signed out; this one stays. */
  async changePin(
    userId: string,
    sessionId: string,
    currentPin: string,
    newPin: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (user.isGuest) throw guestNotAllowed();

    await this.assertPinNotLocked(user);
    if (!(await this.pins.verify(user.pinHash, currentPin))) {
      await this.recordWrongPin(user.id);
      throw invalidCredentials();
    }

    const pinHash = await this.pins.hash(newPin);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { pinHash, failedPinAttempts: 0, pinLockedUntil: null },
      });
      await this.sessions.revokeAllSessions(userId, {
        exceptSessionId: sessionId,
        tx,
      });
    });
  }

  /** Browse without an account. Guests cannot create health profiles. */
  async loginAsGuest(device: DeviceInfo): Promise<AuthTokensResponse> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { isGuest: true, lastLoginAt: new Date() },
      });
      return this.sessions.startSession(user, device, tx);
    });
  }

  refresh(refreshToken: string): Promise<AuthTokensResponse> {
    return this.sessions.refresh(refreshToken);
  }

  logout(sessionId: string): Promise<void> {
    return this.sessions.revokeSession(sessionId);
  }

  updatePushToken(sessionId: string, pushToken: string | null): Promise<void> {
    return this.sessions.updatePushToken(sessionId, pushToken);
  }

  private async findRegisteredByEmail(email: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    return user && !user.isGuest ? user : null;
  }

  private async assertPinNotLocked(user: User): Promise<void> {
    if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
      throw new AppException(
        AuthErrorCode.PIN_LOCKED,
        'Too many wrong PINs; try later or log in with an email code',
        HttpStatus.TOO_MANY_REQUESTS,
        {
          retryAfterSec: Math.ceil(
            (user.pinLockedUntil.getTime() - Date.now()) / 1000,
          ),
        },
      );
    }
  }

  private async recordWrongPin(userId: string): Promise<void> {
    // Atomic increment, so parallel wrong guesses are all counted.
    const { failedPinAttempts } = await this.prisma.user.update({
      where: { id: userId },
      data: { failedPinAttempts: { increment: 1 } },
      select: { failedPinAttempts: true },
    });
    if (failedPinAttempts % PIN_ATTEMPTS_BEFORE_LOCK === 0) {
      const blocks = failedPinAttempts / PIN_ATTEMPTS_BEFORE_LOCK;
      const lockMs = Math.min(
        PIN_LOCK_BASE_MS * 2 ** (blocks - 1),
        PIN_LOCK_MAX_MS,
      );
      await this.prisma.user.update({
        where: { id: userId },
        data: { pinLockedUntil: new Date(Date.now() + lockMs) },
      });
    }
  }
}

function assertActive(user: Pick<User, 'status'>): void {
  if (user.status !== 'ACTIVE') {
    throw new AppException(
      AuthErrorCode.ACCOUNT_SUSPENDED,
      'Account is not active',
      HttpStatus.FORBIDDEN,
    );
  }
}

function invalidCredentials(): AppException {
  return new AppException(
    AuthErrorCode.INVALID_CREDENTIALS,
    'Wrong email or PIN',
    HttpStatus.UNAUTHORIZED,
  );
}

export function guestNotAllowed(): AppException {
  return new AppException(
    AuthErrorCode.GUEST_NOT_ALLOWED,
    'Create an account to use this feature',
    HttpStatus.FORBIDDEN,
  );
}
