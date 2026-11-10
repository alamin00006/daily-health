import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception.js';
import {
  afterCursor,
  toKeysetPage,
} from '../../common/pagination/keyset-cursor.js';
import {
  addDays,
  dateColumnToString,
  dhakaDate,
  dhakaStartOfDay,
  stringToDateColumn,
} from '../../common/time/dhaka-time.js';
import { AppConfigService } from '../../core/config/app-config.service.js';
import { ColumnEncryptionService } from '../../core/crypto/column-encryption.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { ReadableIdService } from '../../core/readable-ids/readable-id.service.js';
import { Prisma, type ProviderPayoutAccount } from '../../generated/prisma/client.js';
import type { PaginatedResponse, PaginationQuery } from '../../shared-contracts/common-fields.contract.js';
import type {
  EarningResponse,
  EarningsSummaryResponse,
  ListPayoutsQuery,
  PayoutAccountRequest,
  PayoutAccountResponse,
  PayoutDueResponse,
  PayoutResponse,
} from '../../shared-contracts/payments.contract.js';
import { ProviderDirectoryService } from '../doctors/provider-directory.service.js';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service.js';
import { PaymentsErrorCode } from './payments-error-codes.js';

const ACCOUNT_CONTEXT = 'payments.ProviderPayoutAccount.accountNumber';
const PAYOUT_INCLUDE = { _count: { select: { earnings: true } } } satisfies Prisma.PayoutInclude;
type PayoutRow = Prisma.PayoutGetPayload<{ include: typeof PAYOUT_INCLUDE }>;

/** "XXXXXXX4521". */
function mask(last4: string, length = 11): string {
  return `${'X'.repeat(Math.max(4, length - 4))}${last4}`;
}

/**
 * A provider's earnings and payouts (panel), and the admin side of payouts:
 * which providers are due, create a payout from their unsettled earnings,
 * mark it paid. A paid payout is never edited (CLAUDE.md §4).
 */
@Injectable()
export class EarningsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly encryption: ColumnEncryptionService,
    private readonly readableIds: ReadableIdService,
    private readonly directory: ProviderDirectoryService,
    private readonly delivery: NotificationDeliveryService,
  ) {}

  async summary(userId: string): Promise<EarningsSummaryResponse> {
    const provider = await this.directory.requireOwn(userId);
    const monthStart = dhakaStartOfDay(`${dhakaDate().slice(0, 7)}-01`);
    const [unsettled, month, payouts] = await Promise.all([
      this.prisma.providerEarning.aggregate({
        where: { providerId: provider.id, payoutId: null },
        _sum: { net: true },
      }),
      this.prisma.providerEarning.aggregate({
        where: { providerId: provider.id, createdAt: { gte: monthStart } },
        _sum: { net: true },
      }),
      this.prisma.payout.groupBy({
        by: ['status'],
        where: { providerId: provider.id, status: { in: ['PENDING', 'PAID'] } },
        _sum: { amount: true },
      }),
    ]);
    const payoutSum = (status: 'PENDING' | 'PAID') =>
      payouts.find((p) => p.status === status)?._sum.amount?.toNumber() ?? 0;
    return {
      unsettled: unsettled._sum.net?.toNumber() ?? 0,
      inPendingPayouts: payoutSum('PENDING'),
      paidOut: payoutSum('PAID'),
      thisMonth: month._sum.net?.toNumber() ?? 0,
      platformFeePercent: this.config.payments.platformFeePercent,
    };
  }

  async list(userId: string, query: PaginationQuery): Promise<PaginatedResponse<EarningResponse>> {
    const provider = await this.directory.requireOwn(userId);
    const rows = await this.prisma.providerEarning.findMany({
      where: { providerId: provider.id, ...afterCursor('createdAt', query.cursor) },
      include: { payment: { select: { invoiceNo: true, description: true } }, payout: { select: { payoutNo: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    return toKeysetPage(rows, query.limit, (row) => row.createdAt, (row) => ({
      id: row.id,
      kind: row.kind,
      invoiceNo: row.payment.invoiceNo,
      description: row.payment.description,
      gross: row.gross.toNumber(),
      platformFee: row.platformFee.toNumber(),
      net: row.net.toNumber(),
      payoutNo: row.payout?.payoutNo ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async myPayouts(userId: string): Promise<PayoutResponse[]> {
    const provider = await this.directory.requireOwn(userId);
    const rows = await this.prisma.payout.findMany({
      where: { providerId: provider.id },
      include: PAYOUT_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return this.toPayoutResponses(rows);
  }

  async getAccount(userId: string): Promise<PayoutAccountResponse | null> {
    const provider = await this.directory.requireOwn(userId);
    const account = await this.prisma.providerPayoutAccount.findUnique({
      where: { providerId: provider.id },
    });
    return account ? toAccountResponse(account) : null;
  }

  async setAccount(userId: string, input: PayoutAccountRequest): Promise<PayoutAccountResponse> {
    const provider = await this.directory.requireOwn(userId);
    const isBank = input.method === 'BANK';
    const data = {
      method: input.method,
      accountName: input.accountName,
      accountNumberEnc: this.encryption.encrypt(input.accountNumber, ACCOUNT_CONTEXT),
      accountNumberLast4: input.accountNumber.slice(-4),
      bankName: isBank ? (input.bankName ?? null) : null,
      branchName: isBank ? (input.branchName ?? null) : null,
      routingNumber: isBank ? (input.routingNumber ?? null) : null,
    };
    const account = await this.prisma.providerPayoutAccount.upsert({
      where: { providerId: provider.id },
      create: { providerId: provider.id, ...data },
      update: data,
    });
    return toAccountResponse(account);
  }

  // --- Admin ------------------------------------------------------------------

  /** Providers with unsettled earnings up to `until` (default yesterday). */
  async due(until?: string): Promise<PayoutDueResponse[]> {
    const end = dhakaStartOfDay(addDays(until ?? addDays(dhakaDate(), -1), 1));
    const groups = await this.prisma.providerEarning.groupBy({
      by: ['providerId'],
      where: { payoutId: null, createdAt: { lt: end } },
      _sum: { net: true },
      _count: { _all: true },
      _min: { createdAt: true },
    });
    const positive = groups.filter((g) => (g._sum.net?.toNumber() ?? 0) > 0);
    const [providers, accounts] = await Promise.all([
      this.directory.summariesByIds(positive.map((g) => g.providerId)),
      this.prisma.providerPayoutAccount.findMany({
        where: { providerId: { in: positive.map((g) => g.providerId) } },
      }),
    ]);
    return positive
      .map((g) => {
        const provider = providers.get(g.providerId);
        const account = accounts.find((a) => a.providerId === g.providerId);
        return {
          providerId: g.providerId,
          providerName: provider?.displayName ?? '',
          providerCode: provider?.providerCode ?? '',
          amount: g._sum.net?.toNumber() ?? 0,
          earningsCount: g._count._all,
          oldestEarningAt: g._min.createdAt?.toISOString() ?? '',
          account: account ? toAccountResponse(account) : null,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }

  async createPayout(adminUserId: string, providerId: string, until: string): Promise<PayoutResponse> {
    const account = await this.prisma.providerPayoutAccount.findUnique({ where: { providerId } });
    if (!account) {
      throw new AppException(
        PaymentsErrorCode.PAYOUT_ACCOUNT_MISSING,
        'The provider has no payout account',
        HttpStatus.CONFLICT,
      );
    }
    const end = dhakaStartOfDay(addDays(until, 1));
    const payout = await this.prisma.$transaction(async (tx) => {
      // Lock this provider's unsettled rows so two admins cannot pay them twice.
      const rows = await tx.$queryRaw<{ id: string; net: Prisma.Decimal; createdAt: Date }[]>`
        SELECT "id", "net", "createdAt" FROM "payments"."ProviderEarning"
        WHERE "providerId" = ${providerId}::uuid AND "payoutId" IS NULL AND "createdAt" < ${end}
        FOR UPDATE`;
      const total = rows.reduce((sum, r) => sum.plus(r.net), new Prisma.Decimal(0));
      if (rows.length === 0 || total.lte(0)) {
        throw new AppException(
          PaymentsErrorCode.NOTHING_TO_PAY_OUT,
          'Nothing to pay out for that period',
          HttpStatus.CONFLICT,
        );
      }
      const first = rows.reduce((min, r) => (r.createdAt < min ? r.createdAt : min), rows[0]!.createdAt);
      const created = await tx.payout.create({
        data: {
          payoutNo: await this.readableIds.nextReference('PAYOUT', tx),
          providerId,
          periodStart: stringToDateColumn(dhakaDate(first)),
          periodEnd: stringToDateColumn(until),
          amount: total,
          method: account.method,
          accountMasked: mask(account.accountNumberLast4, account.method === 'BANK' ? 13 : 11),
          createdByUserId: adminUserId,
        },
      });
      await tx.providerEarning.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { payoutId: created.id },
      });
      return created;
    });
    return this.payoutById(payout.id);
  }

  async listPayouts(query: ListPayoutsQuery): Promise<PaginatedResponse<PayoutResponse>> {
    const rows = await this.prisma.payout.findMany({
      where: { ...(query.status ? { status: query.status } : {}), ...afterCursor('createdAt', query.cursor) },
      include: PAYOUT_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = toKeysetPage(rows, query.limit, (row) => row.createdAt, (row) => row);
    return { data: await this.toPayoutResponses(page.data), meta: page.meta };
  }

  /** The full account number for the admin making the transfer (never stored in logs). */
  async accountForPayout(payoutId: string): Promise<{ accountNumber: string } & PayoutAccountResponse> {
    const payout = await this.requirePayout(payoutId);
    const account = await this.prisma.providerPayoutAccount.findUnique({
      where: { providerId: payout.providerId },
    });
    if (!account) {
      throw new AppException(
        PaymentsErrorCode.PAYOUT_ACCOUNT_MISSING,
        'The provider has no payout account',
        HttpStatus.CONFLICT,
      );
    }
    return {
      ...toAccountResponse(account),
      accountNumber: this.encryption.decrypt(account.accountNumberEnc, ACCOUNT_CONTEXT),
    };
  }

  async markPaid(adminUserId: string, payoutId: string, reference: string): Promise<PayoutResponse> {
    const payout = await this.requirePayout(payoutId);
    const updated = await this.prisma.payout.updateMany({
      where: { id: payout.id, status: 'PENDING' },
      data: { status: 'PAID', reference, paidAt: new Date(), paidByUserId: adminUserId },
    });
    if (updated.count === 0) throw payoutConflict();
    const provider = await this.directory.findById(payout.providerId);
    if (provider) {
      await this.delivery.deliver([
        {
          userId: provider.userId,
          type: 'payout.paid',
          title: 'পেআউট পাঠানো হয়েছে',
          body: `${payout.payoutNo}: ৳${payout.amount.toFixed(0)} · রেফারেন্স ${reference}`,
          channels: ['IN_APP'],
        },
      ]);
    }
    return this.payoutById(payout.id);
  }

  /** A pending payout made by mistake: its earnings become unsettled again. */
  async cancelPayout(payoutId: string): Promise<PayoutResponse> {
    const payout = await this.requirePayout(payoutId);
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.payout.updateMany({
        where: { id: payout.id, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      if (updated.count === 0) throw payoutConflict();
      await tx.providerEarning.updateMany({
        where: { payoutId: payout.id },
        data: { payoutId: null },
      });
    });
    return this.payoutById(payout.id);
  }

  private async requirePayout(payoutId: string) {
    const payout = await this.prisma.payout.findUnique({ where: { id: payoutId } });
    if (!payout) {
      throw new AppException(
        PaymentsErrorCode.PAYOUT_NOT_FOUND,
        'Payout not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return payout;
  }

  private async payoutById(payoutId: string): Promise<PayoutResponse> {
    const row = await this.prisma.payout.findUniqueOrThrow({
      where: { id: payoutId },
      include: PAYOUT_INCLUDE,
    });
    const [response] = await this.toPayoutResponses([row]);
    return response!;
  }

  private async toPayoutResponses(rows: PayoutRow[]): Promise<PayoutResponse[]> {
    const providers = await this.directory.summariesByIds(rows.map((r) => r.providerId));
    return rows.map((row) => ({
      id: row.id,
      payoutNo: row.payoutNo,
      providerId: row.providerId,
      providerName: providers.get(row.providerId)?.displayName ?? '',
      providerCode: providers.get(row.providerId)?.providerCode ?? '',
      periodStart: dateColumnToString(row.periodStart),
      periodEnd: dateColumnToString(row.periodEnd),
      amount: row.amount.toNumber(),
      method: row.method,
      accountMasked: row.accountMasked,
      status: row.status,
      reference: row.reference,
      paidAt: row.paidAt?.toISOString() ?? null,
      earningsCount: row._count.earnings,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}

function toAccountResponse(account: ProviderPayoutAccount): PayoutAccountResponse {
  return {
    method: account.method,
    accountName: account.accountName,
    accountMasked: mask(account.accountNumberLast4, account.method === 'BANK' ? 13 : 11),
    bankName: account.bankName,
    branchName: account.branchName,
    routingNumber: account.routingNumber,
    updatedAt: account.updatedAt.toISOString(),
  };
}

function payoutConflict(): AppException {
  return new AppException(
    PaymentsErrorCode.PAYOUT_STATUS_CONFLICT,
    'Only a pending payout can be changed',
    HttpStatus.CONFLICT,
  );
}
