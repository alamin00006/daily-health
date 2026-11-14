import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception.js';
import { afterCursor, toKeysetPage } from '../../common/pagination/keyset-cursor.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { Prisma, type ShopSetting } from '../../generated/prisma/client.js';
import type { PaginatedResponse, PaginationQuery } from '../../shared-contracts/common-fields.contract.js';
import type {
  ShopSettingsChangeResponse,
  ShopSettingsResponse,
  UpdateShopSettingsRequest,
} from '../../shared-contracts/shop.contract.js';
import { StaffDirectoryService } from '../admin/staff-directory.service.js';
import { ShopErrorCode } from './shop-error-codes.js';

/** Settings are read on every shop request; a short cache keeps that off the DB. */
const CACHE_MS = 10_000;

/**
 * The shop's on/off switch and rules (one row, id 1, created by the migration).
 * Every change is kept in ShopSettingChange.
 */
@Injectable()
export class ShopSettingsService {
  private cached: { value: ShopSetting; at: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly staff: StaffDirectoryService,
  ) {}

  async get(): Promise<ShopSetting> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.value;
    const value = await this.prisma.shopSetting.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    });
    this.cached = { value, at: Date.now() };
    return value;
  }

  async isEnabled(): Promise<boolean> {
    return (await this.get()).enabled;
  }

  /** For the buyer-facing API: throws SHOP_DISABLED while the shop is off. */
  async assertEnabled(): Promise<ShopSetting> {
    const setting = await this.get();
    if (!setting.enabled) {
      throw new AppException(ShopErrorCode.SHOP_DISABLED, 'The shop is switched off', HttpStatus.SERVICE_UNAVAILABLE);
    }
    return setting;
  }

  async view(): Promise<ShopSettingsResponse> {
    const row = await this.get();
    const names = row.updatedByUserId ? await this.staff.namesByUserIds([row.updatedByUserId]) : new Map();
    return {
      enabled: row.enabled,
      cashOnDeliveryEnabled: row.cashOnDeliveryEnabled,
      minOrderAmount: row.minOrderAmount.toNumber(),
      freeDeliveryFrom: row.freeDeliveryFrom?.toNumber() ?? null,
      paymentHoldMinutes: row.paymentHoldMinutes,
      updatedAt: row.updatedAt.toISOString(),
      updatedByName: row.updatedByUserId ? (names.get(row.updatedByUserId) ?? null) : null,
    };
  }

  async update(userId: string, input: UpdateShopSettingsRequest): Promise<ShopSettingsResponse> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.shopSetting.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
      const plain = (row: ShopSetting) => ({
        enabled: row.enabled,
        cashOnDeliveryEnabled: row.cashOnDeliveryEnabled,
        minOrderAmount: row.minOrderAmount.toNumber(),
        freeDeliveryFrom: row.freeDeliveryFrom?.toNumber() ?? null,
        paymentHoldMinutes: row.paymentHoldMinutes,
      });
      const old = plain(before);
      const changes: Record<string, [unknown, unknown]> = {};
      for (const [key, value] of Object.entries(input) as [keyof typeof old, unknown][]) {
        if (value !== undefined && old[key] !== value) changes[key] = [old[key], value];
      }
      if (Object.keys(changes).length === 0) return;
      await tx.shopSetting.update({
        where: { id: 1 },
        data: {
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
          ...(input.cashOnDeliveryEnabled !== undefined
            ? { cashOnDeliveryEnabled: input.cashOnDeliveryEnabled }
            : {}),
          ...(input.minOrderAmount !== undefined ? { minOrderAmount: input.minOrderAmount } : {}),
          ...(input.freeDeliveryFrom !== undefined ? { freeDeliveryFrom: input.freeDeliveryFrom } : {}),
          ...(input.paymentHoldMinutes !== undefined ? { paymentHoldMinutes: input.paymentHoldMinutes } : {}),
          updatedByUserId: userId,
        },
      });
      await tx.shopSettingChange.create({
        data: { changes: changes as Prisma.InputJsonValue, changedByUserId: userId },
      });
    });
    this.cached = null;
    return this.view();
  }

  async history(query: PaginationQuery): Promise<PaginatedResponse<ShopSettingsChangeResponse>> {
    const rows = await this.prisma.shopSettingChange.findMany({
      where: afterCursor('createdAt', query.cursor),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = toKeysetPage(rows, query.limit, (r) => r.createdAt, (r) => r);
    const names = await this.staff.namesByUserIds(page.data.map((r) => r.changedByUserId));
    return {
      data: page.data.map((r) => ({
        id: r.id,
        changes: r.changes as Record<string, [unknown, unknown]>,
        changedByName: names.get(r.changedByUserId) ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: page.meta,
    };
  }
}
