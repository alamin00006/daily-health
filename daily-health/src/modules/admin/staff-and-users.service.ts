import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { ReadableIdService } from '../../core/readable-ids/readable-id.service.js';
import type {
  AddStaffRequest,
  AdminUserResponse,
  ListAdminUsersQuery,
  StaffMemberResponse,
  StaffRole,
  UpdateAdminUserRequest,
  UpdateStaffRequest,
} from '../../shared-contracts/admin.contract.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import { UserAccountsService } from '../auth/user-accounts.service.js';
import { ProviderDirectoryService } from '../doctors/provider-directory.service.js';
import { PatientProfilesService } from '../users/patient-profiles.service.js';
import { AdminErrorCode } from './admin-error-codes.js';

const STAFF_ROLES = new Set(['ADMIN', 'MODERATOR']);

/**
 * User accounts (suspend / reactivate) and staff (moderators, admins). The
 * role lives on auth.User; admin.StaffMember keeps the staff ID and name. A
 * staff ID never changes and stays with the person if they are removed and
 * added again.
 */
@Injectable()
export class StaffAndUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly readableIds: ReadableIdService,
    private readonly accounts: UserAccountsService,
    private readonly profiles: PatientProfilesService,
    private readonly providers: ProviderDirectoryService,
  ) {}

  // -------------------------------------------------------------------------
  // Users
  // -------------------------------------------------------------------------

  async listUsers(query: ListAdminUsersQuery): Promise<PaginatedResponse<AdminUserResponse>> {
    const { accounts, hasMore } = await this.accounts.search({
      q: query.q,
      role: query.role,
      status: query.status,
      cursor: query.cursor,
      limit: query.limit,
    });
    const ids = accounts.map((a) => a.id);
    const [own, providerCodes, staff] = await Promise.all([
      this.profiles.ownProfilesByUserIds(ids),
      this.providers.codesByUserIds(ids),
      this.prisma.staffMember.findMany({ where: { userId: { in: ids } } }),
    ]);
    const staffById = new Map(staff.map((s) => [s.userId, s]));
    return {
      data: accounts.map((a) => {
        const staffRow = STAFF_ROLES.has(a.role) ? staffById.get(a.id) : undefined;
        const provider = providerCodes.get(a.id);
        const profile = own.get(a.id);
        return {
          id: a.id,
          email: a.email,
          role: a.role,
          suspended: a.suspended,
          emailVerified: a.emailVerified,
          name: staffRow?.fullName ?? provider?.displayName ?? profile?.fullName ?? null,
          code: staffRow?.staffCode ?? provider?.providerCode ?? profile?.patientCode ?? null,
          createdAt: a.createdAt.toISOString(),
          lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
        };
      }),
      meta: { cursor: hasMore ? (accounts.at(-1)?.id ?? null) : null, hasMore },
    };
  }

  async updateUser(adminUserId: string, userId: string, input: UpdateAdminUserRequest): Promise<void> {
    if (userId === adminUserId) throw selfChange();
    const account = await this.accounts.findById(userId);
    if (!account) throw new AppException(AdminErrorCode.USER_NOT_FOUND, 'User not found', HttpStatus.NOT_FOUND);
    if (input.suspended && account.role === 'ADMIN') await this.ensureAnotherAdmin(userId);
    await this.accounts.setSuspended(userId, input.suspended);
  }

  // -------------------------------------------------------------------------
  // Staff
  // -------------------------------------------------------------------------

  async listStaff(): Promise<StaffMemberResponse[]> {
    const rows = await this.prisma.staffMember.findMany({ orderBy: { createdAt: 'asc' } });
    const accounts = await this.accounts.findManyByIds(rows.map((r) => r.userId));
    const addedBy = new Map(rows.map((r) => [r.userId, r.fullName]));
    return rows.flatMap((row) => {
      const account = accounts.get(row.userId);
      if (!account || !STAFF_ROLES.has(account.role)) return []; // removed from staff
      return [
        {
          userId: row.userId,
          staffCode: row.staffCode,
          fullName: row.fullName,
          email: account.email,
          role: account.role as StaffRole,
          suspended: !account.isActive,
          addedByName: row.addedByUserId ? (addedBy.get(row.addedByUserId) ?? null) : null,
          createdAt: row.createdAt.toISOString(),
        },
      ];
    });
  }

  async addStaff(adminUserId: string, input: AddStaffRequest): Promise<StaffMemberResponse[]> {
    const account = await this.accounts.findByEmail(input.email);
    if (!account || account.isGuest || !account.emailVerified) {
      throw new AppException(
        AdminErrorCode.STAFF_ACCOUNT_NOT_FOUND,
        'No verified account with this email; ask them to sign up first',
        HttpStatus.NOT_FOUND,
      );
    }
    if (account.id === adminUserId) throw selfChange();
    if (!['PATIENT', 'MODERATOR', 'ADMIN'].includes(account.role)) {
      throw new AppException(
        AdminErrorCode.STAFF_ROLE_CONFLICT,
        'Provider accounts cannot also be staff',
        HttpStatus.CONFLICT,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.staffMember.findUnique({ where: { userId: account.id } });
      if (existing) {
        await tx.staffMember.update({ where: { userId: account.id }, data: { fullName: input.fullName } });
      } else {
        await tx.staffMember.create({
          data: {
            userId: account.id,
            staffCode: await this.readableIds.next(input.role, input.fullName, tx),
            fullName: input.fullName,
            addedByUserId: adminUserId,
          },
        });
      }
    });
    await this.accounts.setStaffRole(account.id, input.role);
    return this.listStaff();
  }

  async updateStaff(adminUserId: string, userId: string, input: UpdateStaffRequest): Promise<StaffMemberResponse[]> {
    const account = await this.requireStaff(userId);
    if (input.role !== undefined && input.role !== account.role) {
      if (userId === adminUserId) throw selfChange();
      if (account.role === 'ADMIN') await this.ensureAnotherAdmin(userId);
      await this.accounts.setStaffRole(userId, input.role);
    }
    if (input.fullName !== undefined) {
      await this.prisma.staffMember.update({ where: { userId }, data: { fullName: input.fullName } });
    }
    return this.listStaff();
  }

  /** Back to a normal account; the staff row (and ID) is kept for history. */
  async removeStaff(adminUserId: string, userId: string): Promise<StaffMemberResponse[]> {
    if (userId === adminUserId) throw selfChange();
    const account = await this.requireStaff(userId);
    if (account.role === 'ADMIN') await this.ensureAnotherAdmin(userId);
    await this.accounts.setStaffRole(userId, 'PATIENT');
    return this.listStaff();
  }

  private async requireStaff(userId: string) {
    const [account, row] = await Promise.all([
      this.accounts.findById(userId),
      this.prisma.staffMember.findUnique({ where: { userId } }),
    ]);
    if (!account || !row || !STAFF_ROLES.has(account.role)) {
      throw new AppException(AdminErrorCode.STAFF_NOT_FOUND, 'Staff member not found', HttpStatus.NOT_FOUND);
    }
    return account;
  }

  /** Some other active admin must remain after this change. */
  private async ensureAnotherAdmin(exceptUserId: string): Promise<void> {
    const others = (await this.accounts.activeStaffUserIds()).filter((id) => id !== exceptUserId);
    const accounts = await this.accounts.findManyByIds(others);
    if (![...accounts.values()].some((a) => a.role === 'ADMIN')) {
      throw new AppException(AdminErrorCode.LAST_ADMIN, 'At least one admin must remain', HttpStatus.CONFLICT);
    }
  }
}

function selfChange(): AppException {
  return new AppException(
    AdminErrorCode.STAFF_SELF_CHANGE,
    'Ask another admin to change your own account',
    HttpStatus.FORBIDDEN,
  );
}
