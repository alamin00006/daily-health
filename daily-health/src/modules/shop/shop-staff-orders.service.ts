import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception.js';
import { afterCursor, toKeysetPage } from '../../common/pagination/keyset-cursor.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import { ORDER_CODE_PATTERN } from '../../shared-contracts/readable-id.contract.js';
import type {
  ListStaffOrdersQuery,
  OrderSummaryResponse,
  ReturnOrderRequest,
  ReviewOrderPrescriptionRequest,
  ShopStaffCountsResponse,
  StaffOrderResponse,
} from '../../shared-contracts/shop.contract.js';
import { PatientProfilesService } from '../users/patient-profiles.service.js';
import { ShopAdminCatalogService } from './shop-admin-catalog.service.js';
import { ShopErrorCode } from './shop-error-codes.js';
import { ShopOrdersService, orderNotFound, stepNotAllowed, summary } from './shop-orders.service.js';

export interface StaffOrderSummaryResponse extends OrderSummaryResponse {
  recipientName: string;
  zoneName: string;
}

/** Staff handle orders in the panel: prescription check, confirm, dispatch, deliver, cancel, return. */
@Injectable()
export class ShopStaffOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: ShopOrdersService,
    private readonly catalog: ShopAdminCatalogService,
    private readonly profiles: PatientProfilesService,
  ) {}

  async list(query: ListStaffOrdersQuery): Promise<PaginatedResponse<StaffOrderSummaryResponse>> {
    const q = query.q?.trim().toUpperCase();
    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.prescription ? { prescriptionCheck: 'PENDING_REVIEW' } : {}),
      ...(q ? (ORDER_CODE_PATTERN.test(q) ? { code: q } : { code: { contains: q } }) : {}),
      ...afterCursor('createdAt', query.cursor),
    };
    const rows = await this.prisma.order.findMany({
      where,
      include: { items: { select: { name: true, qty: true }, orderBy: { id: 'asc' } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = toKeysetPage(rows, query.limit, (r) => r.createdAt, (r) => r);
    return {
      data: page.data.map((r) => ({ ...summary(r, r.items), recipientName: r.recipientName, zoneName: r.zoneName })),
      meta: page.meta,
    };
  }

  async get(staffUserId: string, orderId: string): Promise<StaffOrderResponse> {
    const order = await this.orders.requireDetailed(orderId);
    // Seeing the medicines and prescription of a patient is viewing health data.
    this.orders.audit(staffUserId, order, 'shop.order.staff.view');
    const [base, profiles, buyers] = await Promise.all([
      this.orders.view(order),
      this.profiles.findManyByIds([order.patientId]),
      this.profiles.ownNamesByUserIds([order.userId]),
    ]);
    const profile = profiles.get(order.patientId);
    return {
      ...base,
      // Staff may cancel until delivery.
      canCancel: ['PENDING_PAYMENT', 'PLACED', 'CONFIRMED', 'DISPATCHED'].includes(order.status),
      buyerName: buyers.get(order.userId) ?? null,
      patientCode: profile?.patientCode ?? null,
      patientName: profile?.fullName ?? null,
    };
  }

  /** Approve, or reject (the order is cancelled and refunded when paid). */
  async reviewPrescription(
    staffUserId: string,
    orderId: string,
    input: ReviewOrderPrescriptionRequest,
  ): Promise<StaffOrderResponse> {
    const order = await this.orders.requireDetailed(orderId);
    if (order.prescriptionCheck !== 'PENDING_REVIEW' || !['PENDING_PAYMENT', 'PLACED'].includes(order.status)) {
      throw stepNotAllowed();
    }
    if (!order.prescriptionId && !order.prescriptionStorageKey) {
      throw new AppException(ShopErrorCode.PRESCRIPTION_MISSING, 'No prescription attached yet', HttpStatus.CONFLICT);
    }
    const changed = await this.prisma.order.updateMany({
      where: { id: orderId, prescriptionCheck: 'PENDING_REVIEW' },
      data: {
        prescriptionCheck: input.approve ? 'APPROVED' : 'REJECTED',
        prescriptionReviewNote: input.note ?? null,
        prescriptionReviewedBy: staffUserId,
      },
    });
    if (changed.count === 0) throw stepNotAllowed();
    this.orders.audit(staffUserId, order, input.approve ? 'shop.order.prescription.approve' : 'shop.order.prescription.reject');
    if (!input.approve) {
      await this.orders.cancel(order, ['PENDING_PAYMENT', 'PLACED'], `প্রেসক্রিপশন গ্রহণ করা যায়নি: ${input.note}`, staffUserId);
    }
    return this.get(staffUserId, orderId);
  }

  async confirm(staffUserId: string, orderId: string, note: string | null | undefined): Promise<StaffOrderResponse> {
    const order = await this.orders.requireDetailed(orderId);
    if (order.status === 'PLACED' && !['NOT_NEEDED', 'APPROVED'].includes(order.prescriptionCheck)) {
      throw new AppException(ShopErrorCode.PRESCRIPTION_MISSING, 'Approve the prescription first', HttpStatus.CONFLICT);
    }
    await this.step(orderId, ['PLACED'], 'CONFIRMED', note, staffUserId);
    return this.get(staffUserId, orderId);
  }

  async dispatch(staffUserId: string, orderId: string, note: string | null | undefined): Promise<StaffOrderResponse> {
    await this.step(orderId, ['CONFIRMED'], 'DISPATCHED', note, staffUserId);
    return this.get(staffUserId, orderId);
  }

  async deliver(staffUserId: string, orderId: string, note: string | null | undefined): Promise<StaffOrderResponse> {
    await this.step(orderId, ['DISPATCHED'], 'DELIVERED', note, staffUserId);
    return this.get(staffUserId, orderId);
  }

  async cancel(staffUserId: string, orderId: string, reason: string): Promise<StaffOrderResponse> {
    const order = await this.orders.requireDetailed(orderId);
    await this.orders.cancel(order, ['PENDING_PAYMENT', 'PLACED', 'CONFIRMED', 'DISPATCHED'], reason, staffUserId);
    return this.get(staffUserId, orderId);
  }

  /**
   * After delivery (ADMIN): mark it returned, optionally put the items back, and refund an
   * online payment. Cash orders are paid back by hand.
   */
  async markReturned(staffUserId: string, orderId: string, input: ReturnOrderRequest): Promise<StaffOrderResponse> {
    const order = await this.orders.requireDetailed(orderId);
    const moved = await this.orders.change({
      orderId,
      from: ['DELIVERED'],
      to: 'RETURNED',
      note: input.reason,
      byUserId: staffUserId,
      data: { cancelReason: input.reason },
      releaseStock: input.restock ? 'RETURNED' : undefined,
    });
    if (!moved) throw stepNotAllowed();
    if (order.isPaid) this.orders.requestRefund(orderId, input.reason);
    return this.get(staffUserId, orderId);
  }

  async counts(): Promise<ShopStaffCountsResponse> {
    const [toHandle, toReview, stock] = await Promise.all([
      this.prisma.order.count({ where: { status: { in: ['PLACED', 'CONFIRMED'] } } }),
      this.prisma.order.count({
        where: { prescriptionCheck: 'PENDING_REVIEW', status: { in: ['PENDING_PAYMENT', 'PLACED'] } },
      }),
      this.catalog.counts(),
    ]);
    return { ordersToHandle: toHandle, prescriptionsToReview: toReview, ...stock };
  }

  private async step(
    orderId: string,
    from: ('PLACED' | 'CONFIRMED' | 'DISPATCHED')[],
    to: 'CONFIRMED' | 'DISPATCHED' | 'DELIVERED',
    note: string | null | undefined,
    staffUserId: string,
  ): Promise<void> {
    const exists = await this.prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
    if (!exists) throw orderNotFound();
    const moved = await this.orders.change({ orderId, from, to, note: note ?? null, byUserId: staffUserId });
    if (!moved) throw stepNotAllowed();
  }
}
