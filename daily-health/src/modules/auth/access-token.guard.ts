import {
  HttpStatus,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  IDENTIFY_CALLER_KEY,
  PUBLIC_ROUTE_KEY,
  REGISTERED_USERS_ONLY_KEY,
} from '../../common/auth/auth-route.decorators.js';
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from '../../common/auth/authenticated-user.js';
import { AppException } from '../../common/errors/app-exception.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { AuthErrorCode } from './auth-error-codes.js';
import { guestNotAllowed } from './auth.service.js';
import {
  ACCESS_TOKEN_AUDIENCE,
  type AccessTokenPayload,
} from './auth-sessions.service.js';

/**
 * Global guard: every HTTP route needs `Authorization: Bearer <access token>`
 * unless marked @PublicRoute(). Besides the JWT signature it checks that the
 * session is not revoked (logout, password reset) and the account is active,
 * so revocation takes effect immediately instead of when the token expires.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, targets)) {
      if (
        request.headers.authorization &&
        this.reflector.getAllAndOverride<boolean>(IDENTIFY_CALLER_KEY, targets)
      ) {
        // Best effort: a bad or expired token just means "anonymous" here.
        request.authUser = await this.authenticate(request).catch(
          () => undefined,
        );
      }
      return true;
    }

    request.authUser = await this.authenticate(request);

    if (
      request.authUser.isGuest &&
      this.reflector.getAllAndOverride<boolean>(
        REGISTERED_USERS_ONLY_KEY,
        targets,
      )
    ) {
      throw guestNotAllowed();
    }
    return true;
  }

  private async authenticate(
    request: AuthenticatedRequest,
  ): Promise<AuthenticatedUser> {
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw unauthorized();

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        audience: ACCESS_TOKEN_AUDIENCE,
      });
    } catch (error) {
      if ((error as Error).name === 'TokenExpiredError') {
        throw new AppException(
          AuthErrorCode.ACCESS_TOKEN_EXPIRED,
          'Access token expired',
          HttpStatus.UNAUTHORIZED,
        );
      }
      throw unauthorized();
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      select: {
        userId: true,
        revokedAt: true,
        expiresAt: true,
        user: { select: { status: true, role: true, isGuest: true } },
      },
    });
    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== 'ACTIVE'
    ) {
      throw unauthorized();
    }

    return {
      userId: session.userId,
      sessionId: payload.sid,
      // From the DB, not the token: role changes apply at once.
      role: session.user.role,
      isGuest: session.user.isGuest,
    };
  }
}

function unauthorized(): AppException {
  return new AppException(
    AuthErrorCode.UNAUTHORIZED,
    'Authentication required',
    HttpStatus.UNAUTHORIZED,
  );
}
