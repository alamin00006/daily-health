import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppException } from '../../common/errors/app-exception.js';
import { AppConfigService } from '../../core/config/app-config.service.js';
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
  AUTH_OTP_SMS_EVENT,
  USER_SIGNED_UP_EVENT,
  type AccountIdentifier,
  type AuthOtpSmsEvent,
  type UserSignedUpEvent,
  channelOfDestination,
  userWhereDestination,
} from './account-identifier.js';
import {
  accountAlreadyExistsEmail,
  accountAlreadyExistsSms,
  otpCodeEmail,
  otpCodeSms,
} from './auth-email-templates.js';
import { AuthErrorCode } from './auth-error-codes.js';
import { AuthSessionsService } from './auth-sessions.service.js';
import { OTP_TTL_SECONDS, OtpCodesService } from './otp-codes.service.js';
import { PasswordHashingService } from './password-hashing.service.js';
import { VerificationTokensService } from './verification-tokens.service.js';

/** Wrong passwords in a row before login locks. Every further block of 5 doubles the lock. */
const PASSWORD_ATTEMPTS_BEFORE_LOCK = 5;
const PASSWORD_LOCK_BASE_MS = 15 * 60_000;
const PASSWORD_LOCK_MAX_MS = 24 * 3_600_000;

/**
 * Auth by email (code by email) or Bangladeshi mobile number (code by SMS):
 *   signup:      otp/send(SIGNUP) → otp/verify → signup(token, password)
 *   login:       login(email|phone, password)  or  otp/send(LOGIN) → otp/verify → login/otp(token)
 *   forgot password:  otp/send(RESET_PASSWORD) → otp/verify → password/reset(token, new password)
 * An account opened with a phone has no email, and the other way round.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otpCodes: OtpCodesService,
    private readonly verificationTokens: VerificationTokensService,
    private readonly sessions: AuthSessionsService,
    private readonly passwords: PasswordHashingService,
    private readonly emails: EmailOutboxService,
    private readonly events: EventEmitter2,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Answers the same way whether or not the email / phone has an account, so the
   * endpoint cannot be used to find out who is registered. A code is always issued
   * (same limits for everyone) but only sent when it is usable.
   */
  async sendOtp(id: AccountIdentifier, purpose: OtpPurpose): Promise<SendOtpResponse> {
    // Refuse before issuing: with no SMS gateway the code could never arrive.
    if (id.channel === 'SMS' && !this.config.sms) {
      throw new AppException(
        AuthErrorCode.SMS_NOT_AVAILABLE,
        'Codes by SMS are not available right now; use email',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const issued = await this.otpCodes.issue(id.channel, id.destination, purpose);
    const account = await this.findRegistered(id.destination);
    const ttlMinutes = OTP_TTL_SECONDS / 60;

    if (purpose === 'SIGNUP') {
      if (id.channel === 'EMAIL') {
        await this.emails.enqueue(
          account
            ? accountAlreadyExistsEmail(id.destination)
            : otpCodeEmail(id.destination, purpose, issued.code, ttlMinutes),
        );
      } else {
        this.sendSms(
          id.destination,
          account ? accountAlreadyExistsSms() : otpCodeSms(purpose, issued.code, ttlMinutes),
        );
      }
    } else if (account && account.status === 'ACTIVE') {
      if (id.channel === 'EMAIL') {
        await this.emails.enqueue(otpCodeEmail(id.destination, purpose, issued.code, ttlMinutes));
      } else {
        this.sendSms(id.destination, otpCodeSms(purpose, issued.code, ttlMinutes));
      }
    }

    return {
      expiresInSec: issued.expiresInSec,
      resendAfterSec: issued.resendAfterSec,
    };
  }

  async verifyOtp(
    id: AccountIdentifier,
    purpose: OtpPurpose,
    code: string,
  ): Promise<VerifyOtpResponse> {
    const otpId = await this.otpCodes.verify(id.destination, purpose, code);
    const { token, expiresInSec } = this.verificationTokens.sign({
      otpId,
      destination: id.destination,
      purpose,
    });
    return { verificationToken: token, expiresInSec };
  }

  async signup(input: {
    verificationToken: string;
    password: string;
    fullName?: string;
    /** Extra, unverified contact email for a phone sign-up. */
    email?: string;
    couponCode?: string;
    device: DeviceInfo;
  }): Promise<AuthTokensResponse> {
    const verified = this.verificationTokens.verify(
      input.verificationToken,
      'SIGNUP',
    );
    const passwordHash = await this.passwords.hash(input.password);

    const tokens = await this.prisma.$transaction(async (tx) => {
      await this.otpCodes.consumeVerification(
        tx,
        verified.otpId,
        verified.destination,
        'SIGNUP',
      );
      const byPhone = channelOfDestination(verified.destination) === 'SMS';
      const existing = await tx.user.findUnique({
        where: userWhereDestination(verified.destination),
        select: { id: true, emailVerifiedAt: true },
      });
      if (existing && !byPhone && existing.emailVerifiedAt === null) {
        // Someone typed this address into a phone sign-up without proving it. The
        // person who just proved it wins: the address moves to the new account.
        await tx.user.update({ where: { id: existing.id }, data: { email: null } });
      } else if (existing) {
        throw new AppException(
          byPhone
            ? AuthErrorCode.PHONE_ALREADY_REGISTERED
            : AuthErrorCode.EMAIL_ALREADY_REGISTERED,
          byPhone
            ? 'An account with this phone already exists'
            : 'An account with this email already exists',
          HttpStatus.CONFLICT,
        );
      }

      const contactEmail = byPhone ? input.email : undefined;
      if (contactEmail) {
        const emailTaken = await tx.user.findUnique({
          where: { email: contactEmail },
          select: { id: true },
        });
        if (emailTaken) {
          throw new AppException(
            AuthErrorCode.EMAIL_ALREADY_REGISTERED,
            'An account with this email already exists',
            HttpStatus.CONFLICT,
          );
        }
      }

      const now = new Date();
      const fullName = input.fullName ?? null;
      const user = await tx.user.create({
        data: byPhone
          ? {
              phone: verified.destination,
              email: contactEmail ?? null,
              fullName,
              passwordHash,
              lastLoginAt: now,
            }
          : {
              email: verified.destination,
              emailVerifiedAt: now,
              fullName,
              passwordHash,
              lastLoginAt: now,
            },
      });
      return this.sessions.startSession(user, input.device, tx);
    });

    // After the commit: payments claims the coupon (it re-checks the code itself).
    const event: UserSignedUpEvent = {
      userId: tokens.user.id,
      couponCode: input.couponCode ?? null,
    };
    this.events.emit(USER_SIGNED_UP_EVENT, event);
    return tokens;
  }

  async loginWithPassword(
    id: AccountIdentifier,
    password: string,
    device: DeviceInfo,
  ): Promise<AuthTokensResponse> {
    const user = await this.findRegistered(id.destination);
    if (!user) {
      await this.passwords.verify(null, password);
      throw invalidCredentials();
    }

    await this.assertPasswordNotLocked(user);
    if (!(await this.passwords.verify(user.passwordHash, password))) {
      await this.recordWrongPassword(user.id);
      throw invalidCredentials();
    }
    assertActive(user);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: user.id },
        data: {
          failedPasswordAttempts: 0,
          passwordLockedUntil: null,
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
        where: userWhereDestination(verified.destination),
      });
      if (!user || !canSignInWith(user, verified.destination)) throw invalidCredentials();
      assertActive(user);

      // Proving the email / phone also clears a password lockout.
      const updated = await tx.user.update({
        where: { id: user.id },
        data: {
          failedPasswordAttempts: 0,
          passwordLockedUntil: null,
          lastLoginAt: new Date(),
        },
      });
      return this.sessions.startSession(updated, device, tx);
    });
  }

  /** Sets a new password and signs out every other device. */
  async resetPassword(
    verificationToken: string,
    newPassword: string,
    device: DeviceInfo,
  ): Promise<AuthTokensResponse> {
    const verified = this.verificationTokens.verify(
      verificationToken,
      'RESET_PASSWORD',
    );
    const passwordHash = await this.passwords.hash(newPassword);

    return this.prisma.$transaction(async (tx) => {
      await this.otpCodes.consumeVerification(
        tx,
        verified.otpId,
        verified.destination,
        'RESET_PASSWORD',
      );
      const user = await tx.user.findUnique({
        where: userWhereDestination(verified.destination),
      });
      if (!user || !canSignInWith(user, verified.destination)) throw invalidCredentials();
      assertActive(user);

      const updated = await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          failedPasswordAttempts: 0,
          passwordLockedUntil: null,
          lastLoginAt: new Date(),
        },
      });
      await this.sessions.revokeAllSessions(user.id, { tx });
      return this.sessions.startSession(updated, device, tx);
    });
  }

  /** Logged-in password change. Other devices are signed out; this one stays. */
  async changePassword(
    userId: string,
    sessionId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (user.isGuest) throw guestNotAllowed();

    await this.assertPasswordNotLocked(user);
    if (!(await this.passwords.verify(user.passwordHash, currentPassword))) {
      await this.recordWrongPassword(user.id);
      throw invalidCredentials();
    }

    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, failedPasswordAttempts: 0, passwordLockedUntil: null },
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

  /**
   * The account this email / phone signs in to. An email typed into a phone sign-up is
   * not proven, so it never signs anyone in (nor blocks the real owner's sign-up).
   */
  private async findRegistered(destination: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: userWhereDestination(destination),
    });
    return user && canSignInWith(user, destination) ? user : null;
  }

  /** Hands the SMS to the notifications module, which sends it and logs failures. */
  private sendSms(phone: string, text: string): void {
    const event: AuthOtpSmsEvent = { phone, text };
    this.events.emit(AUTH_OTP_SMS_EVENT, event);
  }

  private async assertPasswordNotLocked(user: User): Promise<void> {
    if (user.passwordLockedUntil && user.passwordLockedUntil > new Date()) {
      throw new AppException(
        AuthErrorCode.PASSWORD_LOCKED,
        'Too many wrong passwords; try later or log in with a code',
        HttpStatus.TOO_MANY_REQUESTS,
        {
          retryAfterSec: Math.ceil(
            (user.passwordLockedUntil.getTime() - Date.now()) / 1000,
          ),
        },
      );
    }
  }

  private async recordWrongPassword(userId: string): Promise<void> {
    // Atomic increment, so parallel wrong guesses are all counted.
    const { failedPasswordAttempts } = await this.prisma.user.update({
      where: { id: userId },
      data: { failedPasswordAttempts: { increment: 1 } },
      select: { failedPasswordAttempts: true },
    });
    if (failedPasswordAttempts % PASSWORD_ATTEMPTS_BEFORE_LOCK === 0) {
      const blocks = failedPasswordAttempts / PASSWORD_ATTEMPTS_BEFORE_LOCK;
      const lockMs = Math.min(
        PASSWORD_LOCK_BASE_MS * 2 ** (blocks - 1),
        PASSWORD_LOCK_MAX_MS,
      );
      await this.prisma.user.update({
        where: { id: userId },
        data: { passwordLockedUntil: new Date(Date.now() + lockMs) },
      });
    }
  }
}

function canSignInWith(
  user: Pick<User, 'isGuest' | 'emailVerifiedAt'>,
  destination: string,
): boolean {
  if (user.isGuest) return false;
  return channelOfDestination(destination) === 'SMS' || user.emailVerifiedAt !== null;
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
    'Wrong email / phone or password',
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
