import {
  applyDecorators,
  HttpStatus,
  Injectable,
  SetMetadata,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '../../shared-contracts/auth.contract.js';
import { AppException } from '../errors/app-exception.js';
import { ErrorCode } from '../errors/error-codes.js';
import type { AuthenticatedRequest } from './authenticated-user.js';

const STAFF_ROLES_KEY = 'auth:staff-roles';

/**
 * Runs after the global AccessTokenGuard, whose role comes from the database
 * (not the token), so a role change applies at once.
 */
@Injectable()
export class StaffRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(
      STAFF_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles?.length) return true;
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>()
      .authUser;
    if (user && roles.includes(user.role)) return true;
    throw new AppException(
      ErrorCode.FORBIDDEN,
      'This needs a staff role',
      HttpStatus.FORBIDDEN,
    );
  }
}

/** Admin panel routes (moderators get their own routes in step 10). */
export const AdminOnly = () =>
  applyDecorators(
    SetMetadata(STAFF_ROLES_KEY, ['ADMIN'] satisfies UserRole[]),
    UseGuards(StaffRoleGuard),
  );
