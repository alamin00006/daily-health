import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception.js';
import { afterCursor, toKeysetPage } from '../../common/pagination/keyset-cursor.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { Prisma, StockMovementReason } from '../../generated/prisma/client.js';
import type { PaginatedResponse, PaginationQuery } from '../../shared-contracts/common-fields.contract.js';
import type { StockMovementResponse } from '../../shared-contracts/shop.contract.js';
import { StaffDirectoryService } from '../admin/staff-directory.service.js';
import { ShopErrorCode } from './shop-error-codes.js';

type Tx = Prisma.TransactionClient;

export interface StockMove {
  productId: string;
  change: number;
  reason: StockMovementReason;
  orderId?: string | null;
  note?: string | null;
  byUserId?: string | null;
}

/**
 * The inventory ledger. Product.stockQty only changes here, in one statement that
 * refuses to go below zero, and every change writes a StockMovement with the balance.
 */
@Injectable()
export class ShopStockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staff: StaffDirectoryService,
  ) {}

  /** Returns the new balance, or null when the stock is too low (nothing changed). */
  async tryMove(tx: Tx, move: StockMove): Promise<number | null> {
    const rows = await tx.$queryRaw<{ stockQty: number }[]>`
      UPDATE "shop"."Product"
      SET "stockQty" = "stockQty" + ${move.change}, "updatedAt" = now()
      WHERE "id" = ${move.productId}::uuid AND "stockQty" + ${move.change} >= 0
      RETURNING "stockQty"`;
    if (rows.length === 0) return null;
    const balanceAfter = rows[0].stockQty;
    await tx.stockMovement.create({
      data: {
        productId: move.productId,
        change: move.change,
        balanceAfter,
        reason: move.reason,
        orderId: move.orderId ?? null,
        note: move.note ?? null,
        byUserId: move.byUserId ?? null,
      },
    });
    return balanceAfter;
  }

  async move(tx: Tx, move: StockMove): Promise<number> {
    const balance = await this.tryMove(tx, move);
    if (balance === null) {
      throw new AppException(ShopErrorCode.STOCK_TOO_LOW, 'Not enough stock for this change', HttpStatus.CONFLICT, {
        productId: move.productId,
      });
    }
    return balance;
  }

  async history(productId: string, query: PaginationQuery): Promise<PaginatedResponse<StockMovementResponse>> {
    const rows = await this.prisma.stockMovement.findMany({
      where: { productId, ...afterCursor('createdAt', query.cursor) },
      include: { order: { select: { code: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = toKeysetPage(rows, query.limit, (r) => r.createdAt, (r) => r);
    const names = await this.staff.namesByUserIds(
      page.data.flatMap((r) => (r.byUserId ? [r.byUserId] : [])),
    );
    return {
      data: page.data.map((r) => ({
        id: r.id,
        change: r.change,
        balanceAfter: r.balanceAfter,
        reason: r.reason,
        note: r.note,
        orderCode: r.order?.code ?? null,
        byName: r.byUserId ? (names.get(r.byUserId) ?? null) : null,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: page.meta,
    };
  }
}
