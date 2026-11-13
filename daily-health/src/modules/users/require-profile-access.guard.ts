import {
  applyDecorators,
  createParamDecorator,
  HttpStatus,
  Injectable,
  SetMetadata,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../../common/auth/authenticated-user.js';
import { AppException } from '../../common/errors/app-exception.js';
import {
  ProfileAccessService,
  type ProfileAccess,
  type ProfileAction,
} from './profile-access.service.js';
import { UsersErrorCode } from './users-error-codes.js';

const PROFILE_ACCESS_KEY = 'users:profile-access';

interface ProfileAccessRule {
  action: ProfileAction;
  /** Route param that holds the profile id. */
  param: string;
}

interface ProfileAccessRequest extends AuthenticatedRequest {
  profileAccess?: ProfileAccess;
}

const uuidSchema = z.uuid();

@Injectable()
export class ProfileAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: ProfileAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // A route's own rule wins over its controller's.
    const rule = this.reflector.getAllAndOverride<ProfileAccessRule | undefined>(
      PROFILE_ACCESS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!rule) return true;

    const request = context.switchToHttp().getRequest<ProfileAccessRequest>();
    const user = request.authUser;
    if (!user)
      throw new Error('ProfileAccessGuard needs an authenticated route');

    const profileId = request.params[rule.param];
    if (!uuidSchema.safeParse(profileId).success) {
      throw new AppException(
        UsersErrorCode.PROFILE_NOT_FOUND,
        'Profile not found',
        HttpStatus.NOT_FOUND,
      );
    }
    request.profileAccess = await this.access.assert(
      user.userId,
      profileId as string,
      rule.action,
    );
    return true;
  }
}

/**
 * `@RequireProfileAccess(ProfileAction.EDIT)` on a route with `:profileId`.
 * The checked profile + membership are then available via @CurrentProfileAccess().
 */
export const RequireProfileAccess = (
  action: ProfileAction,
  param = 'profileId',
) =>
  applyDecorators(
    SetMetadata(PROFILE_ACCESS_KEY, {
      action,
      param,
    } satisfies ProfileAccessRule),
    UseGuards(ProfileAccessGuard),
  );

export const CurrentProfileAccess = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ProfileAccess => {
    const access = context
      .switchToHttp()
      .getRequest<ProfileAccessRequest>().profileAccess;
    if (!access)
      throw new Error('CurrentProfileAccess needs @RequireProfileAccess');
    return access;
  },
);
