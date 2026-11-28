import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AppException } from '../../common/errors/app-exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { afterCursor, toKeysetPage } from '../../common/pagination/keyset-cursor.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { Prisma, type Coupon, type CouponClaim } from '../../generated/prisma/client.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import type {
  AdminCouponResponse,
  ApplicableCouponResponse,
  ApplicableCouponsQuery,
  CheckCouponResponse,
  CreateCouponRequest,
  ListCouponsQuery,
  MyCouponResponse,
  PaymentPurpose,
  UpdateCouponRequest,
} from '../../shared-contracts/payments.contract.js';
import { quoteCoupon } from '../../shared-contracts/payments.contract.js';
import {
  USER_SIGNED_UP_EVENT,
  type UserSignedUpEvent,
} from '../auth/account-identifier.js';
import { PayableRegistryService } from './payable-registry.service.js';
import { PaymentsErrorCode } from './payments-error-codes.js';

type CouponProblem = 'COUPON_INVALID' | 'COUPON_EXPIRED' | 'COUPON_LIMIT_REACHED';

type Tx = Prisma.TransactionClient;

/**
 * Discount codes (Roadmap doc, 2026-11-26). Admins create them in the panel; a person
 * claims one by typing it into the sign-up form and spends it at checkout. The platform
 * pays the discount (owner's decision, 2026-11-27): provider earnings use the list price.
 * A use is held while the checkout is open (RESERVED), kept when it is paid (USED) and
 * given back when the payment fails, is abandoned or is fully refunded (RELEASED).
 */
@Injectable()
export class CouponsService {
  private readonly logger = new Logger(CouponsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payables: PayableRegistryService,
  ) {}

  /** My coupons for one checkout, each with what it would take off. */
  async applicable(userId: string, query: ApplicableCouponsQuery): Promise<ApplicableCouponResponse[]> {
    const item = await this.payables.resolve(query.purpose, userId, query.referenceId);
    const now = new Date();
    const claims = await this.prisma.couponClaim.findMany({
      where: { userId, usesLeft: { gt: 0 } },
      include: { coupon: true },
      orderBy: { claimedAt: 'desc' },
      take: 50,
    });
    return claims
      .filter((claim) => claimProblem(claim.coupon, now) === null)
      .map((claim) => {
        const { discount, reason } = quoteCoupon(claim.coupon, query.purpose, item.amount);
        return {
          claimId: claim.id,
          code: claim.coupon.code,
          title: claim.coupon.title,
          listAmount: item.amount,
          discountAmount: discount,
          payAmount: Math.round((item.amount - discount) * 100) / 100,
          notApplicableReason: reason,
          usesLeft: claim.usesLeft,
          endsAt: claim.coupon.endsAt?.toISOString() ?? null,
        };
      })
      .sort((a, b) => Number(a.notApplicableReason !== null) - Number(b.notApplicableReason !== null) || b.discountAmount - a.discountAmount);
  }

  /**
   * Checks that `claimId` is the payer's and works for this price, and returns the
   * discount. Nothing is held yet: `reserve` does that with the payment.
   */
  async quoteForCheckout(
    userId: string,
    claimId: string,
    purpose: PaymentPurpose,
    listAmount: number,
  ): Promise<number> {
    const claim = await this.prisma.couponClaim.findFirst({
      where: { id: claimId, userId },
      include: { coupon: true },
    });
    if (!claim) throw couponError('COUPON_INVALID');
    const problem = claimProblem(claim.coupon, new Date());
    if (problem) throw couponError(problem);
    if (claim.usesLeft <= 0) throw couponError('COUPON_LIMIT_REACHED');
    const { discount, reason } = quoteCoupon(claim.coupon, purpose, listAmount);
    if (reason) {
      throw new AppException(
        PaymentsErrorCode.COUPON_NOT_APPLICABLE,
        'This coupon cannot be used on this payment',
        HttpStatus.CONFLICT,
        { reason, minAmount: claim.coupon.minAmount === null ? null : Number(claim.coupon.minAmount) },
      );
    }
    return discount;
  }

  /** Holds one use of the claim for a new payment, in the payment's transaction. */
  async reserve(tx: Tx, input: { claimId: string; paymentId: string; discountAmount: number }): Promise<void> {
    const claim = await tx.couponClaim.findUniqueOrThrow({ where: { id: input.claimId } });
    const taken = await tx.couponClaim.updateMany({
      where: { id: claim.id, usesLeft: { gt: 0 } },
      data: { usesLeft: { decrement: 1 } },
    });
    // Spent on another device a moment ago.
    if (taken.count === 0) throw couponError('COUPON_LIMIT_REACHED');
    await tx.couponRedemption.create({
      data: {
        claimId: claim.id,
        couponId: claim.couponId,
        paymentId: input.paymentId,
        discountAmount: new Prisma.Decimal(input.discountAmount),
      },
    });
  }

  /** The payment went through: the held use is spent. */
  async markUsed(tx: Tx, paymentId: string): Promise<void> {
    await tx.couponRedemption.updateMany({
      where: { paymentId, status: 'RESERVED' },
      data: { status: 'USED' },
    });
  }

  /** The payment failed, was abandoned or fully refunded: the use goes back. Safe to call twice. */
  async release(tx: Tx, paymentId: string): Promise<void> {
    const redemption = await tx.couponRedemption.findUnique({ where: { paymentId } });
    if (!redemption || redemption.status === 'RELEASED') return;
    const changed = await tx.couponRedemption.updateMany({
      where: { id: redemption.id, status: { not: 'RELEASED' } },
      data: { status: 'RELEASED' },
    });
    if (changed.count === 1) {
      await tx.couponClaim.update({
        where: { id: redemption.claimId },
        data: { usesLeft: { increment: 1 } },
      });
    }
  }

  /** `release` outside a transaction (several payments closed by updateMany). */
  async releaseAll(paymentIds: string[]): Promise<void> {
    for (const paymentId of paymentIds) {
      await this.prisma.$transaction((tx) => this.release(tx, paymentId));
    }
  }

  /** For the sign-up form: is this code usable right now? */
  async check(code: string): Promise<CheckCouponResponse> {
    const coupon = await this.prisma.coupon.findUnique({ where: { code } });
    const problem = couponProblem(coupon, new Date());
    if (problem || !coupon) throw couponError(problem ?? 'COUPON_INVALID');
    return toPublic(coupon);
  }

  /** The new account claims the code typed at sign-up. A code that went bad meanwhile is skipped. */
  @OnEvent(USER_SIGNED_UP_EVENT, { async: true, promisify: true })
  async onSignedUp(event: UserSignedUpEvent): Promise<void> {
    if (!event.couponCode) return;
    try {
      await this.claim(event.userId, event.couponCode);
    } catch (error) {
      const reason = error instanceof AppException ? error.code : 'UNEXPECTED';
      if (reason === 'UNEXPECTED') this.logger.error({ err: error }, 'Coupon claim at sign-up failed');
      else this.logger.warn({ reason }, 'Coupon from sign-up not claimed');
    }
  }

  async claim(userId: string, code: string): Promise<CouponClaim> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Row lock so two claims cannot both take the last place under maxClaims.
        const [locked] = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "payments"."Coupon" WHERE code = ${code} FOR UPDATE`;
        const coupon = locked ? await tx.coupon.findUnique({ where: { id: locked.id } }) : null;
        const problem = couponProblem(coupon, new Date());
        if (problem || !coupon) throw couponError(problem ?? 'COUPON_INVALID');

        const created = await tx.couponClaim.create({
          data: { couponId: coupon.id, userId, source: 'SIGNUP', usesLeft: coupon.usesPerClaim },
        });
        await tx.coupon.update({
          where: { id: coupon.id },
          data: { claimCount: { increment: 1 } },
        });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(
          PaymentsErrorCode.COUPON_ALREADY_CLAIMED,
          'This coupon is already yours',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async mine(userId: string): Promise<MyCouponResponse[]> {
    const claims = await this.prisma.couponClaim.findMany({
      where: { userId },
      include: { coupon: true },
      orderBy: { claimedAt: 'desc' },
      take: 50,
    });
    const now = new Date();
    return claims.map((claim) => ({
      ...toPublic(claim.coupon),
      claimId: claim.id,
      usesLeft: claim.usesLeft,
      claimedAt: claim.claimedAt.toISOString(),
      usable: claim.usesLeft > 0 && claimProblem(claim.coupon, now) === null,
    }));
  }

  // ---------------------------------------------------------------- admin

  async list(query: ListCouponsQuery): Promise<PaginatedResponse<AdminCouponResponse>> {
    const rows = await this.prisma.coupon.findMany({
      where: {
        ...(query.q ? { code: { contains: query.q.toUpperCase() } } : {}),
        ...afterCursor('createdAt', query.cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const usage = await this.usage(rows.map((row) => row.id));
    return toKeysetPage(rows, query.limit, (row) => row.createdAt, (row) => toAdmin(row, usage.get(row.id)));
  }

  /** Paid uses and the discount the platform paid, per coupon. */
  private async usage(couponIds: string[]): Promise<Map<string, CouponUsage>> {
    if (couponIds.length === 0) return new Map();
    const groups = await this.prisma.couponRedemption.groupBy({
      by: ['couponId'],
      where: { couponId: { in: couponIds }, status: 'USED' },
      _count: { _all: true },
      _sum: { discountAmount: true },
    });
    return new Map(
      groups.map((g) => [
        g.couponId,
        { usedCount: g._count._all, discountGiven: g._sum.discountAmount?.toNumber() ?? 0 },
      ]),
    );
  }

  async create(adminUserId: string, input: CreateCouponRequest): Promise<AdminCouponResponse> {
    try {
      const coupon = await this.prisma.coupon.create({
        data: {
          code: input.code,
          ...couponData(input),
          createdByUserId: adminUserId,
        } as Prisma.CouponUncheckedCreateInput,
      });
      return toAdmin(coupon);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(
          PaymentsErrorCode.COUPON_CODE_TAKEN,
          'A coupon with this code already exists',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async update(couponId: string, input: UpdateCouponRequest): Promise<AdminCouponResponse> {
    const current = await this.prisma.coupon.findUnique({ where: { id: couponId } });
    if (!current) {
      throw new AppException(PaymentsErrorCode.COUPON_NOT_FOUND, 'Coupon not found', HttpStatus.NOT_FOUND);
    }
    // Rules that span fields are checked against the merged result.
    const discountType = input.discountType ?? current.discountType;
    const discountValue = input.discountValue ?? Number(current.discountValue);
    if (discountType === 'PERCENT' && discountValue > 100) {
      throw validation('discountValue', 'A percentage cannot be more than 100');
    }
    const startsAt = input.startsAt === undefined ? current.startsAt : input.startsAt && new Date(input.startsAt);
    const endsAt = input.endsAt === undefined ? current.endsAt : input.endsAt && new Date(input.endsAt);
    if (startsAt && endsAt && startsAt >= endsAt) throw validation('endsAt', 'Must be after the start');
    const maxClaims = input.maxClaims === undefined ? current.maxClaims : input.maxClaims;
    if (maxClaims !== null && maxClaims < current.claimCount) {
      throw validation('maxClaims', 'Already claimed by more people than this');
    }

    const coupon = await this.prisma.coupon.update({
      where: { id: couponId },
      data: couponData(input),
    });
    return toAdmin(coupon, (await this.usage([coupon.id])).get(coupon.id));
  }
}

function couponData(input: UpdateCouponRequest): Prisma.CouponUpdateInput {
  const data: Prisma.CouponUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.discountType !== undefined) data.discountType = input.discountType;
  if (input.discountValue !== undefined) data.discountValue = new Prisma.Decimal(input.discountValue);
  if (input.maxDiscount !== undefined) {
    data.maxDiscount = input.maxDiscount === null ? null : new Prisma.Decimal(input.maxDiscount);
  }
  if (input.minAmount !== undefined) {
    data.minAmount = input.minAmount === null ? null : new Prisma.Decimal(input.minAmount);
  }
  if (input.appliesTo !== undefined) data.appliesTo = { set: [...new Set(input.appliesTo)] };
  if (input.startsAt !== undefined) data.startsAt = input.startsAt ? new Date(input.startsAt) : null;
  if (input.endsAt !== undefined) data.endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (input.maxClaims !== undefined) data.maxClaims = input.maxClaims;
  if (input.usesPerClaim !== undefined) data.usesPerClaim = input.usesPerClaim;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  return data;
}

/** Why a code cannot be claimed now, or null when it can. */
function couponProblem(coupon: Coupon | null, now: Date): CouponProblem | null {
  if (!coupon) return 'COUPON_INVALID';
  const timing = claimProblem(coupon, now);
  if (timing) return timing;
  if (coupon.maxClaims !== null && coupon.claimCount >= coupon.maxClaims) return 'COUPON_LIMIT_REACHED';
  return null;
}

/** Whether an existing claim can still be spent (the claim limit no longer matters). */
function claimProblem(coupon: Coupon, now: Date): CouponProblem | null {
  if (!coupon.isActive) return 'COUPON_INVALID';
  // Not started yet reads as "not a valid code" so codes cannot be probed early.
  if (coupon.startsAt && coupon.startsAt > now) return 'COUPON_INVALID';
  if (coupon.endsAt && coupon.endsAt <= now) return 'COUPON_EXPIRED';
  return null;
}

function couponError(problem: CouponProblem): AppException {
  const messages: Record<CouponProblem, string> = {
    COUPON_INVALID: 'No usable coupon with this code',
    COUPON_EXPIRED: 'This coupon has expired',
    COUPON_LIMIT_REACHED: 'This coupon has been claimed by as many people as allowed',
  };
  return new AppException(
    PaymentsErrorCode[problem],
    messages[problem],
    problem === 'COUPON_INVALID' ? HttpStatus.NOT_FOUND : HttpStatus.CONFLICT,
  );
}

function validation(field: string, message: string): AppException {
  return new AppException(ErrorCode.VALIDATION_FAILED, message, HttpStatus.BAD_REQUEST, {
    issues: [{ path: field, code: 'custom', message }],
  });
}

function toPublic(coupon: Coupon): CheckCouponResponse {
  return {
    code: coupon.code,
    title: coupon.title,
    discountType: coupon.discountType,
    discountValue: Number(coupon.discountValue),
    maxDiscount: coupon.maxDiscount === null ? null : Number(coupon.maxDiscount),
    minAmount: coupon.minAmount === null ? null : Number(coupon.minAmount),
    appliesTo: coupon.appliesTo,
    endsAt: coupon.endsAt?.toISOString() ?? null,
  };
}

interface CouponUsage {
  usedCount: number;
  discountGiven: number;
}
const NO_USAGE: CouponUsage = { usedCount: 0, discountGiven: 0 };

function toAdmin(coupon: Coupon, usage: CouponUsage = NO_USAGE): AdminCouponResponse {
  return {
    ...toPublic(coupon),
    id: coupon.id,
    startsAt: coupon.startsAt?.toISOString() ?? null,
    maxClaims: coupon.maxClaims,
    claimCount: coupon.claimCount,
    usesPerClaim: coupon.usesPerClaim,
    isActive: coupon.isActive,
    usedCount: usage.usedCount,
    discountGiven: usage.discountGiven,
    createdAt: coupon.createdAt.toISOString(),
    updatedAt: coupon.updatedAt.toISOString(),
  };
}
