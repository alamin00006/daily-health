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

  /** Active ADMIN and MODERATOR accounts (emergency alerts). */
  async activeStaffUserIds(): Promise<string[]> {
    const rows = await this.prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'MODERATOR'] }, status: 'ACTIVE' },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  /** Accounts for the admin's user list: newest first, filtered by email part and role. */
  async search(input: {
    q?: string;
    role?: UserRole;
    status?: 'ACTIVE' | 'SUSPENDED';
    cursor?: string;
    limit: number;
  }): Promise<{ accounts: (UserAccount & { createdAt: Date; lastLoginAt: Date | null; suspended: boolean })[]; hasMore: boolean }> {
    const rows = await this.prisma.user.findMany({
      where: {
        isGuest: false,
        status: input.status ?? { not: 'DELETED' },
        ...(input.role ? { role: input.role } : {}),
        ...(input.q ? { email: { contains: input.q.toLowerCase() } } : {}),
      },
      select: { ...ACCOUNT_SELECT, createdAt: true, lastLoginAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, input.limit);
    return {
      accounts: page.map((row) => ({
        ...toAccount(row),
        createdAt: row.createdAt,
        lastLoginAt: row.lastLoginAt,
        suspended: row.status === 'SUSPENDED',
      })),
      hasMore: rows.length > input.limit,
    };
  }

  /** Staff role changes (admin module). Provider roles are never touched here. */
  async setStaffRole(userId: string, role: Extract<UserRole, 'PATIENT' | 'MODERATOR' | 'ADMIN'>): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { role } });
  }

  /** Suspending ends every session at once; the access guard also re-reads status. */
  async setSuspended(userId: string, suspended: boolean): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { status: suspended ? 'SUSPENDED' : 'ACTIVE' },
      }),
      ...(suspended
        ? [
            this.prisma.session.updateMany({
              where: { userId, revokedAt: null },
              data: { revokedAt: new Date() },
            }),
          ]
        : []),
    ]);
  }

  async countAccounts(since?: Date): Promise<number> {
    return this.prisma.user.count({
      where: { isGuest: false, status: { not: 'DELETED' }, ...(since ? { createdAt: { gte: since } } : {}) },
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
