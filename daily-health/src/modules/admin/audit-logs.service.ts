import { Injectable } from '@nestjs/common';
import { afterCursor, toKeysetPage } from '../../common/pagination/keyset-cursor.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { AuditLog } from '../../generated/prisma/client.js';
import type { AuditLogResponse, ListAuditLogsQuery } from '../../shared-contracts/admin.contract.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import { UserAccountsService } from '../auth/user-accounts.service.js';
import { ProviderDirectoryService } from '../doctors/provider-directory.service.js';
import { PatientProfilesService } from '../users/patient-profiles.service.js';
import { StaffDirectoryService } from './staff-directory.service.js';

const EMPTY: PaginatedResponse<AuditLogResponse> = { data: [], meta: { cursor: null, hasMore: false } };

/** Who looked at or changed whose health data, newest first. Admins only. */
@Injectable()
export class AuditLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: UserAccountsService,
    private readonly profiles: PatientProfilesService,
    private readonly providers: ProviderDirectoryService,
    private readonly staff: StaffDirectoryService,
  ) {}

  async list(query: ListAuditLogsQuery): Promise<PaginatedResponse<AuditLogResponse>> {
    let patientId: string | undefined;
    if (query.patientCode) {
      const profile = await this.profiles.findByPatientCode(query.patientCode);
      if (!profile) return EMPTY;
      patientId = profile.id;
    }
    let actorUserId: string | undefined;
    if (query.actorEmail) {
      const account = await this.accounts.findByEmail(query.actorEmail);
      if (!account) return EMPTY;
      actorUserId = account.id;
    }
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(patientId ? { patientId } : {}),
        ...(actorUserId ? { actorUserId } : {}),
        ...(query.action ? { action: { startsWith: query.action } } : {}),
        ...afterCursor('createdAt', query.cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = toKeysetPage(rows, query.limit, (r) => r.createdAt, (r) => r);
    return { data: await this.views(page.data), meta: page.meta };
  }

  private async views(rows: AuditLog[]): Promise<AuditLogResponse[]> {
    const actorIds = [...new Set(rows.flatMap((r) => (r.actorUserId ? [r.actorUserId] : [])))];
    const [profiles, accounts, own, providerCodes, staffNames] = await Promise.all([
      this.profiles.findManyByIds(rows.map((r) => r.patientId)),
      this.accounts.findManyByIds(actorIds),
      this.profiles.ownProfilesByUserIds(actorIds),
      this.providers.codesByUserIds(actorIds),
      this.staff.namesByUserIds(actorIds),
    ]);
    const staffCodes = await this.staffCodes(actorIds);
    return rows.map((row) => {
      const profile = profiles.get(row.patientId);
      const account = row.actorUserId ? accounts.get(row.actorUserId) : undefined;
      const actorId = row.actorUserId ?? '';
      const provider = providerCodes.get(actorId);
      return {
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        patient: profile ? { patientCode: profile.patientCode, fullName: profile.fullName } : null,
        actor: account
          ? {
              email: account.email,
              role: account.role,
              name: staffNames.get(actorId) ?? provider?.displayName ?? own.get(actorId)?.fullName ?? null,
              code: staffCodes.get(actorId) ?? provider?.providerCode ?? own.get(actorId)?.patientCode ?? null,
            }
          : null,
        meta: (row.meta as AuditLogResponse['meta']) ?? null,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  private async staffCodes(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.prisma.staffMember.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, staffCode: true },
    });
    return new Map(rows.map((r) => [r.userId, r.staffCode]));
  }
}
