import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { UserRole } from '../../shared-contracts/auth.contract.js';

export interface UserAccount {
  id: string;
  email: string | null;
  emailVerified: boolean;
  role: UserRole;
  isGuest: boolean;
  isActive: boolean;
}

const ACCOUNT_SELECT = {
  id: true,
  email: true,
  emailVerifiedAt: true,
  role: true,
  isGuest: true,
  status: true,
} as const;

/**
 * The auth module's public API for other modules. Other modules never read
 * auth tables directly (CLAUDE.md §4 "Module boundaries").
 * Never exposes PIN hashes or lockout state.
 */
@Injectable()
export class UserAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(userId: string): Promise<UserAccount | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: ACCOUNT_SELECT,
    });
    return user ? toAccount(user) : null;
  }

  /** `email` must already be normalised (lowercased). */
  async findByEmail(email: string): Promise<UserAccount | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: ACCOUNT_SELECT,
    });
    return user ? toAccount(user) : null;
  }

  /**
   * A patient account becomes a provider account (doctors module). Staff
   * roles (moderator, admin) are never replaced this way.
   */
  async promoteToProviderRole(
    userId: string,
    role: Extract<UserRole, 'DOCTOR' | 'NUTRITIONIST' | 'PHYSIO'>,
  ): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id: userId, role: 'PATIENT' },
      data: { role },
    });
  }

  async findManyByIds(userIds: string[]): Promise<Map<string, UserAccount>> {
    if (userIds.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: ACCOUNT_SELECT,
    });
    return new Map(users.map((user) => [user.id, toAccount(user)]));
  }
}

function toAccount(user: {
  id: string;
  email: string | null;
  emailVerifiedAt: Date | null;
  role: UserRole;
  isGuest: boolean;
  status: string;
}): UserAccount {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    role: user.role,
    isGuest: user.isGuest,
    isActive: user.status === 'ACTIVE',
  };
}
