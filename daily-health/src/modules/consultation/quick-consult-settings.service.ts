import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import {
  afterCursor,
  toKeysetPage,
} from '../../common/pagination/keyset-cursor.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import {
  Prisma,
  type QuickConsultSetting,
} from '../../generated/prisma/client.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import type {
  ListQuickConsultSettingHistoryQuery,
  QuickConsultKind,
  QuickConsultOptionResponse,
  QuickConsultSettingChangeResponse,
  QuickConsultSettingResponse,
  UpdateQuickConsultSettingRequest,
} from '../../shared-contracts/consultation.contract.js';
import { UserAccountsService } from '../auth/user-accounts.service.js';
import { ProviderDirectoryService } from '../doctors/provider-directory.service.js';
import { PatientProfilesService } from '../users/patient-profiles.service.js';

const KINDS: QuickConsultKind[] = ['GENERAL', 'WOMENS_HEALTH'];

/** Women's health quick consults go to female doctors only (CLAUDE.md §4). */
export function requiredGenderFor(kind: QuickConsultKind): 'FEMALE' | null {
  return kind === 'WOMENS_HEALTH' ? 'FEMALE' : null;
}

/**
 * The quick-consult price and rules per kind, set by admins in the panel.
 * A change applies to quick consults created afterwards (each consultation
 * keeps the fee it was created with) and is kept in an append-only history.
 */
@Injectable()
export class QuickConsultSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directory: ProviderDirectoryService,
    private readonly accounts: UserAccountsService,
    private readonly profiles: PatientProfilesService,
  ) {}

  async require(kind: QuickConsultKind): Promise<QuickConsultSetting> {
    const setting = await this.prisma.quickConsultSetting.findUnique({ where: { kind } });
    if (!setting) {
      throw new AppException(ErrorCode.NOT_FOUND, `No setting for ${kind}`, HttpStatus.NOT_FOUND);
    }
    return setting;
  }

  /** What the app shows before starting: price, wait and who is online. */
  async options(): Promise<QuickConsultOptionResponse[]> {
    const settings = await this.prisma.quickConsultSetting.findMany();
    const online = await this.directory.onlineQuickConsultProviders(null);
    return KINDS.flatMap((kind) => {
      const setting = settings.find((s) => s.kind === kind);
      if (!setting) return [];
      const gender = requiredGenderFor(kind);
      return [
        {
          kind,
          price: setting.price.toNumber(),
          isEnabled: setting.isEnabled,
          maxWaitMin: setting.maxWaitMin,
          sessionMin: setting.sessionMin,
          doctorsOnline: online.filter((p) => !gender || p.gender === gender).length,
        },
      ];
    });
  }

  async list(): Promise<QuickConsultSettingResponse[]> {
    const settings = await this.prisma.quickConsultSetting.findMany();
    const names = await this.names(settings.flatMap((s) => (s.updatedByUserId ? [s.updatedByUserId] : [])));
    return KINDS.flatMap((kind) => {
      const setting = settings.find((s) => s.kind === kind);
      return setting ? [this.toResponse(setting, names)] : [];
    });
  }

  async update(
    adminUserId: string,
    kind: QuickConsultKind,
    input: UpdateQuickConsultSettingRequest,
  ): Promise<QuickConsultSettingResponse> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const [current] = await tx.$queryRaw<QuickConsultSetting[]>`
        SELECT * FROM "consultation"."QuickConsultSetting" WHERE "kind" = ${kind}::"consultation"."QuickConsultKind" FOR UPDATE`;
      if (!current) {
        throw new AppException(ErrorCode.NOT_FOUND, `No setting for ${kind}`, HttpStatus.NOT_FOUND);
      }
      const price = new Prisma.Decimal(input.price).toDecimalPlaces(2);
      const next = await tx.quickConsultSetting.update({
        where: { kind },
        data: {
          price,
          isEnabled: input.isEnabled,
          maxWaitMin: input.maxWaitMin,
          sessionMin: input.sessionMin,
          updatedByUserId: adminUserId,
        },
      });
      await tx.quickConsultSettingChange.create({
        data: {
          kind,
          oldPrice: new Prisma.Decimal(current.price),
          newPrice: price,
          oldEnabled: current.isEnabled,
          newEnabled: input.isEnabled,
          oldMaxWaitMin: current.maxWaitMin,
          newMaxWaitMin: input.maxWaitMin,
          oldSessionMin: current.sessionMin,
          newSessionMin: input.sessionMin,
          changedByUserId: adminUserId,
        },
      });
      return next;
    });
    return this.toResponse(updated, await this.names([adminUserId]));
  }

  async history(
    query: ListQuickConsultSettingHistoryQuery,
  ): Promise<PaginatedResponse<QuickConsultSettingChangeResponse>> {
    const rows = await this.prisma.quickConsultSettingChange.findMany({
      where: afterCursor('changedAt', query.cursor),
      orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const names = await this.names(rows.map((row) => row.changedByUserId));
    return toKeysetPage(
      rows,
      query.limit,
      (row) => row.changedAt,
      (row) => ({
        id: row.id,
        kind: row.kind,
        oldPrice: row.oldPrice.toNumber(),
        newPrice: row.newPrice.toNumber(),
        oldEnabled: row.oldEnabled,
        newEnabled: row.newEnabled,
        changedByName: names.get(row.changedByUserId) ?? null,
        changedAt: row.changedAt.toISOString(),
      }),
    );
  }

  /** Admin's own profile name, else their email (admins see each other in the panel). */
  private async names(userIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(userIds)];
    const names = await this.profiles.ownNamesByUserIds(unique);
    for (const userId of unique) {
      if (names.has(userId)) continue;
      const account = await this.accounts.findById(userId);
      if (account?.email) names.set(userId, account.email);
    }
    return names;
  }

  private toResponse(
    setting: QuickConsultSetting,
    names: Map<string, string>,
  ): QuickConsultSettingResponse {
    return {
      kind: setting.kind,
      price: setting.price.toNumber(),
      isEnabled: setting.isEnabled,
      maxWaitMin: setting.maxWaitMin,
      sessionMin: setting.sessionMin,
      updatedAt: setting.updatedAt.toISOString(),
      updatedByName: setting.updatedByUserId ? (names.get(setting.updatedByUserId) ?? null) : null,
    };
  }
}
