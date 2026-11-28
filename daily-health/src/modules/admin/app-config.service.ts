import { Injectable } from '@nestjs/common';
import { afterCursor, toKeysetPage } from '../../common/pagination/keyset-cursor.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { AppSetting } from '../../generated/prisma/client.js';
import {
  DEFAULT_PRIMARY_COLOR,
  primaryPalette,
  type AdminAppConfigResponse,
  type AppConfigChangeResponse,
  type AppConfigResponse,
  type LegalPageResponse,
  type LegalPageSlug,
  type UpdateAppConfigRequest,
  type UpdateLegalPageRequest,
  type UpdateSupportContactsRequest,
} from '../../shared-contracts/app-config.contract.js';
import type { PaginatedResponse, PaginationQuery } from '../../shared-contracts/common-fields.contract.js';
import { StaffDirectoryService } from './staff-directory.service.js';

/**
 * The app's look (primary colour; every change is kept), the support numbers on the
 * account page, and the terms and privacy policy. All set by admins.
 */
@Injectable()
export class AppConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staff: StaffDirectoryService,
  ) {}

  async get(): Promise<AppConfigResponse> {
    return view(await this.row());
  }

  async adminGet(): Promise<AdminAppConfigResponse> {
    const row = await this.row();
    const names = row.updatedByUserId ? await this.staff.namesByUserIds([row.updatedByUserId]) : new Map<string, string>();
    return { ...view(row), updatedByName: row.updatedByUserId ? (names.get(row.updatedByUserId) ?? null) : null };
  }

  async update(userId: string, input: UpdateAppConfigRequest): Promise<AdminAppConfigResponse> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.appSetting.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
      if (before.primaryColor === input.primaryColor) return;
      await tx.appSetting.update({
        where: { id: 1 },
        data: { primaryColor: input.primaryColor, updatedByUserId: userId },
      });
      await tx.appSettingChange.create({
        data: { fromColor: before.primaryColor, toColor: input.primaryColor, changedByUserId: userId },
      });
    });
    return this.adminGet();
  }

  /** WhatsApp and hotline numbers on the app's account page; null hides a button. */
  async updateSupport(userId: string, input: UpdateSupportContactsRequest): Promise<AdminAppConfigResponse> {
    await this.row();
    await this.prisma.appSetting.update({
      where: { id: 1 },
      data: { supportWhatsApp: input.whatsApp, supportHotline: input.hotline, updatedByUserId: userId },
    });
    return this.adminGet();
  }

  async legalPage(slug: LegalPageSlug): Promise<LegalPageResponse> {
    const page = await this.prisma.legalPage.findUnique({ where: { slug } });
    return { slug, body: page?.body ?? null, updatedAt: page?.updatedAt.toISOString() ?? null };
  }

  async updateLegalPage(userId: string, slug: LegalPageSlug, input: UpdateLegalPageRequest): Promise<LegalPageResponse> {
    const page = await this.prisma.legalPage.upsert({
      where: { slug },
      create: { slug, body: input.body, updatedByUserId: userId },
      update: { body: input.body, updatedByUserId: userId },
    });
    return { slug, body: page.body, updatedAt: page.updatedAt.toISOString() };
  }

  async history(query: PaginationQuery): Promise<PaginatedResponse<AppConfigChangeResponse>> {
    const rows = await this.prisma.appSettingChange.findMany({
      where: afterCursor('createdAt', query.cursor),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = toKeysetPage(rows, query.limit, (r) => r.createdAt, (r) => r);
    const names = await this.staff.namesByUserIds(page.data.map((r) => r.changedByUserId));
    return {
      data: page.data.map((r) => ({
        id: r.id,
        fromColor: r.fromColor,
        toColor: r.toColor,
        changedByName: names.get(r.changedByUserId) ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: page.meta,
    };
  }

  private row(): Promise<AppSetting> {
    return this.prisma.appSetting.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  }
}

function view(row: AppSetting): AppConfigResponse {
  const primaryColor = row.primaryColor || DEFAULT_PRIMARY_COLOR;
  return {
    primaryColor,
    palette: primaryPalette(primaryColor),
    support: { whatsApp: row.supportWhatsApp, hotline: row.supportHotline },
    updatedAt: row.updatedAt.toISOString(),
  };
}
