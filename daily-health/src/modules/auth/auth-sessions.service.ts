import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppException } from '../../common/errors/app-exception.js';
import { AppConfigService } from '../../core/config/app-config.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { User } from '../../generated/prisma/client.js';
import type {
  AuthTokensResponse,
  AuthUserSummary,
} from '../../shared-contracts/auth.contract.js';
import type { DeviceInfo } from '../../shared-contracts/common-fields.contract.js';
import { AuthErrorCode } from './auth-error-codes.js';

export const ACCESS_TOKEN_AUDIENCE = 'access';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  role: User['role'];
  guest: boolean;
}

type Tx = Pick<PrismaService, 'device' | 'session'>;

/**
 * Devices, sessions and tokens.
 * - Access token: JWT (HS256), short-lived, carries user id + session id.
 * - Refresh token: `<sessionId>.<random secret>`; only SHA-256 of the secret is stored.
 *   Rotated on every refresh; presenting an old one revokes the whole session.
 */
@Injectable()
export class AuthSessionsService {
  private readonly accessTtlSec: number;
  private readonly refreshTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: AppConfigService,
  ) {
    this.accessTtlSec = config.auth.accessTokenTtlSeconds;
    this.refreshTtlMs = config.auth.refreshTokenTtlDays * 86_400_000;
  }

  /** Registers/updates the device and opens a new session on it. */
  async startSession(
    user: Pick<User, 'id' | 'email' | 'role' | 'isGuest'>,
    device: DeviceInfo,
    tx: Tx = this.prisma,
  ): Promise<AuthTokensResponse> {
    const now = new Date();

    // One account per app install: whoever logged in before on this install is
    // signed out there, and stops receiving pushes on this phone.
    const previousOnInstall = await tx.device.findMany({
      where: {
        installationId: device.installationId,
        userId: { not: user.id },
      },
      select: { id: true },
    });
    if (previousOnInstall.length > 0) {
      const ids = previousOnInstall.map((d) => d.id);
      await tx.session.updateMany({
        where: { deviceId: { in: ids }, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.device.updateMany({
        where: { id: { in: ids } },
        data: { pushToken: null },
      });
    }
    if (device.pushToken) {
      await tx.device.updateMany({
        where: {
          pushToken: device.pushToken,
          NOT: { userId: user.id, installationId: device.installationId },
        },
        data: { pushToken: null },
      });
    }

    const savedDevice = await tx.device.upsert({
      where: {
        userId_installationId: {
          userId: user.id,
          installationId: device.installationId,
        },
      },
      create: {
        userId: user.id,
        installationId: device.installationId,
        platform: device.platform,
        appVersion: device.appVersion ?? null,
        pushToken: device.pushToken ?? null,
        lastSeenAt: now,
      },
      update: {
        platform: device.platform,
        appVersion: device.appVersion ?? null,
        ...(device.pushToken ? { pushToken: device.pushToken } : {}),
        lastSeenAt: now,
      },
    });

    const secret = newSecret();
    const session = await tx.session.create({
      data: {
        userId: user.id,
        deviceId: savedDevice.id,
        refreshTokenHash: sha256(secret),
        expiresAt: new Date(now.getTime() + this.refreshTtlMs),
        lastUsedAt: now,
      },
    });

    return this.tokens(user, session.id, secret);
  }

  async refresh(refreshToken: string): Promise<AuthTokensResponse> {
    const [sessionId, secret] = refreshToken.split('.');
    if (!sessionId || !secret || !isUuid(sessionId)) throw invalidRefresh();

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });
    const now = new Date();
    if (!session || session.revokedAt || session.expiresAt <= now) {
      throw invalidRefresh();
    }

    if (!safeEqualHex(session.refreshTokenHash, sha256(secret))) {
      // An old token was replayed: someone may hold a stolen copy.
      await this.revokeSession(session.id);
      throw invalidRefresh();
    }
    if (session.user.status !== 'ACTIVE') {
      await this.revokeSession(session.id);
      throw new AppException(
        AuthErrorCode.ACCOUNT_SUSPENDED,
        'Account is not active',
        HttpStatus.FORBIDDEN,
      );
    }

    const nextSecret = newSecret();
    // Compare-and-swap on the old hash: of two parallel refreshes only one wins.
    const { count } = await this.prisma.session.updateMany({
      where: { id: session.id, refreshTokenHash: session.refreshTokenHash },
      data: {
        refreshTokenHash: sha256(nextSecret),
        expiresAt: new Date(now.getTime() + this.refreshTtlMs),
        lastUsedAt: now,
      },
    });
    if (count === 0) throw invalidRefresh();
    await this.prisma.device.update({
      where: { id: session.deviceId },
      data: { lastSeenAt: now },
    });

    return this.tokens(session.user, session.id, nextSecret);
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllSessions(
    userId: string,
    options: { exceptSessionId?: string; tx?: Tx } = {},
  ): Promise<void> {
    await (options.tx ?? this.prisma).session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(options.exceptSessionId
          ? { id: { not: options.exceptSessionId } }
          : {}),
      },
      data: { revokedAt: new Date() },
    });
  }

  async updatePushToken(
    sessionId: string,
    pushToken: string | null,
  ): Promise<void> {
    const session = await this.prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: { deviceId: true, userId: true },
    });
    await this.prisma.$transaction(async (tx) => {
      if (pushToken) {
        await tx.device.updateMany({
          where: { pushToken, id: { not: session.deviceId } },
          data: { pushToken: null },
        });
      }
      await tx.device.update({
        where: { id: session.deviceId },
        data: { pushToken, lastSeenAt: new Date() },
      });
    });
  }

  private tokens(
    user: Pick<User, 'id' | 'email' | 'role' | 'isGuest'>,
    sessionId: string,
    secret: string,
  ): AuthTokensResponse {
    const payload: AccessTokenPayload = {
      sub: user.id,
      sid: sessionId,
      role: user.role,
      guest: user.isGuest,
    };
    const summary: AuthUserSummary = {
      id: user.id,
      email: user.email,
      role: user.role,
      isGuest: user.isGuest,
    };
    return {
      accessToken: this.jwt.sign(payload, {
        audience: ACCESS_TOKEN_AUDIENCE,
        expiresIn: this.accessTtlSec,
      }),
      accessTokenExpiresInSec: this.accessTtlSec,
      refreshToken: `${sessionId}.${secret}`,
      user: summary,
    };
  }
}

function newSecret(): string {
  return randomBytes(32).toString('base64url');
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function invalidRefresh(): AppException {
  return new AppException(
    AuthErrorCode.REFRESH_TOKEN_INVALID,
    'Session expired; log in again',
    HttpStatus.UNAUTHORIZED,
  );
}
