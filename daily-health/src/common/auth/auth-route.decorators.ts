import {
  createParamDecorator,
  SetMetadata,
  type ExecutionContext,
} from '@nestjs/common';
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from './authenticated-user.js';

export const PUBLIC_ROUTE_KEY = 'auth:public-route';
export const REGISTERED_USERS_ONLY_KEY = 'auth:registered-users-only';

export const IDENTIFY_CALLER_KEY = 'auth:identify-caller';

/** Every route needs a valid access token unless marked public. */
export const PublicRoute = () => SetMetadata(PUBLIC_ROUTE_KEY, true);

/**
 * On a @PublicRoute(): if a valid access token is sent, set the caller (read
 * with @OptionalCurrentUser()); a missing or bad token stays anonymous, no 401.
 */
export const IdentifyCallerIfLoggedIn = () =>
  SetMetadata(IDENTIFY_CALLER_KEY, true);

/** The caller on an @IdentifyCallerIfLoggedIn() route, or null when anonymous. */
export const OptionalCurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | null =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().authUser ?? null,
);

/** Guests (no email/PIN) get 403 GUEST_NOT_ALLOWED. */
export const RegisteredUsersOnly = () =>
  SetMetadata(REGISTERED_USERS_ONLY_KEY, true);

/** The caller, as verified by AccessTokenGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.authUser) {
      // Only reachable if used on a @PublicRoute(): a programming error.
      throw new Error('CurrentUser used on a route without authentication');
    }
    return request.authUser;
  },
);
