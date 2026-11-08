import type { Request } from 'express';
import type { UserRole } from '../../shared-contracts/auth.contract.js';

/** Who is calling, set by the auth module's AccessTokenGuard on every non-public route. */
export interface AuthenticatedUser {
  userId: string;
  sessionId: string;
  role: UserRole;
  isGuest: boolean;
}

export interface AuthenticatedRequest extends Request {
  authUser?: AuthenticatedUser;
}
