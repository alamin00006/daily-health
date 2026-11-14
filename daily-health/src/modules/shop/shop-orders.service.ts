import { InjectQueue } from '@nestjs/bullmq';
import { HttpStatus, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import type { Queue } from 'bullmq';
import { AppException } from '../../common/errors/app-exception.js';
import { emitAuditEvent } from '../../common/events/audit-event.js';
import {
  PAYMENT_REFUND_REQUESTED_EVENT,
  PAYMENT_SUCCEEDED_EVENT,
  type PaymentRefundRequestedEvent,
  type PaymentSucceededEvent,
} from '../../common/events/booking-events.js';
import { afterCursor, toKeysetPage } from '../../common/pagination/keyset-cursor.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { ReadableIdService } from '../../core/readable-ids/readable-id.service.js';
import { StoredUploadsService } from '../../core/uploads/stored-uploads.service.js';
import { UploadedFileProcessorService } from '../../core/uploads/uploaded-file-processor.service.js';
import type { Order, OrderEvent, OrderItem, OrderStatus, Prisma } from '../../generated/prisma/client.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import type {
  ListMyOrdersQuery,
  OrderResponse,
  OrderSummaryResponse,
  PlaceOrderRequest,
} from '../../shared-contracts/shop.contract.js';
import { UserAccountsService } from '../auth/user-accounts.service.js';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service.js';
import { PayableRegistryService, type PayableItem } from '../payments/payable-registry.service.js';
import { PaymentsErrorCode } from '../payments/payments-error-codes.js';
import { PrescriptionLookupService } from '../prescriptions/prescription-lookup.service.js';
import { ProfileAccessService, ProfileAction } from '../users/profile-access.service.js';
import { ShopCartService, deliveryChargeFor } from './shop-cart.service.js';
import { ShopErrorCode } from './shop-error-codes.js';
import { ShopSettingsService } from './shop-settings.service.js';
import { ShopStockService } from './shop-stock.service.js';

export const SHOP_ORDER_HOLDS_QUEUE = 'shop-order-holds';
export const EXPIRE_ORDER_HOLD_JOB = 'expire-order-hold';

/** The gateway page must not open with only seconds of the hold left. */
const MIN_HOLD_LEFT_MS = 60_000;
const PRESCRIPTION_IMAGE_MIME = 'image/webp';

/** Before dispatch the buyer may cancel (full refund when paid). */
const BUYER_CANCELLABLE: OrderStatus[] = ['PENDING_PAYMENT', 'PLACED', 'CONFIRMED'];
/** Orders that still hold stock. */
const HOLDS_STOCK: OrderStatus[] = ['PENDING_PAYMENT', 'PLACED', 'CONFIRMED', 'DISPATCHED'];

const STATUS_TEXT: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'পেমেন্টের অপেক্ষায়',
  PLACED: 'অর্ডার নেওয়া হয়েছে',
  CONFIRMED: 'অর্ডার নিশ্চিত, প্যাক করা হচ্ছে',
  DISPATCHED: 'ডেলিভারির পথে',
  DELIVERED: 'ডেলিভারি হয়েছে',
  CANCELLED: 'অর্ডার বাতিল হয়েছে',
  EXPIRED: 'সময়মতো পেমেন্ট না হওয়ায় অর্ডার বাতিল',
  RETURNED: 'অর্ডার ফেরত নেওয়া হয়েছে',
};

export type OrderWithDetails = Order & {
  items: (OrderItem & { product: { imageStorageKey: string | null } })[];
  events: OrderEvent[];
};

export interface StatusChange {
  orderId: string;
  from: OrderStatus[];
  to: OrderStatus;
  note?: string | null;
  byUserId?: string | null;
  data?: Prisma.OrderUpdateManyMutationInput;
  /** Put the items back into stock (cancel, expiry, return with restock). */
  releaseStock?: 'ORDER_RELEASED' | 'RETURNED';
}

/**
 * Orders from the buyer's side, plus the shared status machine:
 *
 *   ONLINE:  PENDING_PAYMENT ─paid→ PLACED ─→ CONFIRMED ─→ DISPATCHED ─→ DELIVERED (─→ RETURNED)
 *            └─ hold ends unpaid → EXPIRED
 *   CASH:    PLACED ─→ …
 *   Before DISPATCHED the buyer can cancel; staff can cancel until delivery.
 *
 * Stock is taken when the order is created (so an unpaid order holds it until
 * holdExpiresAt) and put back when it is cancelled, expires or is returned with restock.
 * A prescription-only order cannot be CONFIRMED until staff approve its prescription
 * (also a DB CHECK).
 */
@Injectable()
export class ShopOrdersService implements OnModuleInit {
  private readonly logger = new Logger(ShopOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: ShopSettingsService,
    private readonly cart: ShopCartService,
    private readonly stock: ShopStockService,
    private readonly readableIds: ReadableIdService,
    private readonly access: ProfileAccessService,
    private readonly prescriptions: PrescriptionLookupService,
    private readonly uploads: StoredUploadsService,
    private readonly processor: UploadedFileProcessorService,
    private readonly registry: PayableRegistryService,
    private readonly delivery: NotificationDeliveryService,
    private readonly accounts: UserAccountsService,
    private readonly events: EventEmitter2,
    @InjectQueue(SHOP_ORDER_HOLDS_QUEUE) private readonly holds: Queue,
  ) {}

  onModuleInit(): void {
    this.registry.register('ORDER', (userId, referenceId) => this.payable(userId, referenceId));
  }

  // -------------------------------------------------------------------------
  // Buyer
  // -------------------------------------------------------------------------

  async place(userId: string, input: PlaceOrderRequest): Promise<OrderResponse> {
    const setting = await this.settings.assertEnabled();
    const { profile } = await this.access.assert(userId, input.patientId, ProfileAction.EDIT);
    const address = await this.cart.requireAddress(userId, input.addressId);
    if (!address.zone.isActive) {
      throw new AppException(ShopErrorCode.DELIVERY_ZONE_NOT_FOUND, 'We do not deliver there now', HttpStatus.CONFLICT);
    }
    if (input.paymentMethod === 'CASH_ON_DELIVERY' && !setting.cashOnDeliveryEnabled) {
      throw new AppException(ShopErrorCode.CASH_ON_DELIVERY_UNAVAILABLE, 'Cash on delivery is off', HttpStatus.CONFLICT);
    }
    const priced = await this.cart.priced(userId, setting);
    if (priced.problems.length > 0) throw cartNotOrderable(priced.problems);

    const needsPrescription = priced.response.requiresPrescription;
    if (input.prescriptionId) {
      if (!needsPrescription) {
        throw new AppException(ShopErrorCode.PRESCRIPTION_NOT_NEEDED, 'No prescription-only medicine in the cart');
      }
      await this.requireIssuedPrescription(input.prescriptionId, profile.id);
    }

    const subtotal = priced.response.subtotal;
    const deliveryCharge = deliveryChargeFor(address.zone, setting, subtotal);
    const online = input.paymentMethod === 'ONLINE';
    const holdExpiresAt = online ? new Date(Date.now() + setting.paymentHoldMinutes * 60_000) : null;
    const status: OrderStatus = online ? 'PENDING_PAYMENT' : 'PLACED';

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          code: await this.readableIds.nextReference('ORDER', tx),
          userId,
          patientId: profile.id,
          status,
          paymentMethod: input.paymentMethod,
          subtotal,
          deliveryCharge,
          total: deliveryCharge.plus(subtotal),
          savings: priced.response.savings,
          recipientName: address.recipientName,
          phone: address.phone,
          zoneName: address.zone.name,
          area: address.area,
          addressLine: address.addressLine,
          note: input.note ?? null,
          holdExpiresAt,
          prescriptionCheck: needsPrescription
            ? input.prescriptionId
              ? 'PENDING_REVIEW'
              : 'AWAITING_PRESCRIPTION'
            : 'NOT_NEEDED',
          prescriptionId: input.prescriptionId ?? null,
          items: {
            create: priced.lines.map(({ product, qty }) => ({
              productId: product.id,
              name: [product.name, product.strength].filter(Boolean).join(' '),
              packSize: product.packSize,
              unitPrice: product.price,
              mrp: product.mrp,
              qty,
              lineTotal: product.price.mul(qty),
              requiresPrescription: product.requiresPrescription,
            })),
          },
          events: { create: { status, byUserId: userId } },
        },
      });
      for (const { product, qty } of priced.lines) {
        const left = await this.stock.tryMove(tx, {
          productId: product.id,
          change: -qty,
          reason: 'ORDER',
          orderId: created.id,
        });
        // Someone else bought the last ones a moment ago: nothing is saved.
        if (left === null) {
          throw cartNotOrderable([{ productId: product.id, code: 'QTY_TOO_HIGH', maxQty: product.stockQty }]);
        }
      }
      await tx.cartItem.deleteMany({ where: { userId } });
      return created;
    });

    this.audit(userId, order, 'shop.order.place');
    if (holdExpiresAt) await this.queueHoldExpiry(order.id, holdExpiresAt);
    else await this.notifyStaffNewOrder(order);
    return this.view(await this.requireDetailed(order.id));
  }

  async listMine(userId: string, query: ListMyOrdersQuery): Promise<PaginatedResponse<OrderSummaryResponse>> {
    const rows = await this.prisma.order.findMany({
      where: { userId, ...(query.status ? { status: query.status } : {}), ...afterCursor('createdAt', query.cursor) },
      include: { items: { select: { name: true, qty: true }, orderBy: { id: 'asc' } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = toKeysetPage(rows, query.limit, (r) => r.createdAt, (r) => r);
    return { data: page.data.map((r) => summary(r, r.items)), meta: page.meta };
  }

  async getMine(userId: string, orderId: string): Promise<OrderResponse> {
    const order = await this.requireDetailed(orderId);
    if (order.userId !== userId) throw orderNotFound();
    this.audit(userId, order, 'shop.order.view');
    return this.view(order);
  }

  async cancelMine(userId: string, orderId: string, reason: string): Promise<OrderResponse> {
    const order = await this.requireOwn(userId, orderId);
    await this.cancel(order, BUYER_CANCELLABLE, reason, userId);
    return this.view(await this.requireDetailed(orderId));
  }

  /** A photo of a paper prescription (private). Replaces an earlier photo. */
  async attachPrescriptionPhoto(userId: string, orderId: string, file: Buffer): Promise<OrderResponse> {
    const order = await this.requireOwn(userId, orderId);
    this.assertPrescriptionEditable(order);
    const processed = await this.processor.process(file, { allowPdf: false });
    const storageKey = await this.uploads.store(processed, 'private');
    const changed = await this.prisma.order.updateMany({
      where: { id: orderId, prescriptionCheck: { in: ['AWAITING_PRESCRIPTION', 'PENDING_REVIEW'] } },
      data: { prescriptionStorageKey: storageKey, prescriptionCheck: 'PENDING_REVIEW' },
    });
    if (changed.count === 0) {
      await this.uploads.remove(storageKey, processed.mimeType);
      throw stepNotAllowed();
    }
    if (order.prescriptionStorageKey) await this.uploads.remove(order.prescriptionStorageKey, PRESCRIPTION_IMAGE_MIME);
    this.audit(userId, order, 'shop.order.prescription.attach');
    if (order.status === 'PLACED') await this.notifyStaffNewOrder(order, true);
    return this.view(await this.requireDetailed(orderId));
  }

  async linkPrescription(userId: string, orderId: string, prescriptionId: string): Promise<OrderResponse> {
    const order = await this.requireOwn(userId, orderId);
    this.assertPrescriptionEditable(order);
    await this.requireIssuedPrescription(prescriptionId, order.patientId);
    const changed = await this.prisma.order.updateMany({
      where: { id: orderId, prescriptionCheck: { in: ['AWAITING_PRESCRIPTION', 'PENDING_REVIEW'] } },
      data: { prescriptionId, prescriptionCheck: 'PENDING_REVIEW' },
    });
    if (changed.count === 0) throw stepNotAllowed();
    this.audit(userId, order, 'shop.order.prescription.attach');
    if (order.status === 'PLACED') await this.notifyStaffNewOrder(order, true);
    return this.view(await this.requireDetailed(orderId));
  }

  // -------------------------------------------------------------------------
  // Payments
  // -------------------------------------------------------------------------

  private async payable(userId: string, orderId: string): Promise<PayableItem> {
    await this.settings.assertEnabled();
    const order = await this.requireOwn(userId, orderId);
    const { profile } = await this.access.assert(userId, order.patientId, ProfileAction.VIEW);
    const holdLeft = (order.holdExpiresAt?.getTime() ?? 0) - Date.now();
    if (order.status !== 'PENDING_PAYMENT' || holdLeft < MIN_HOLD_LEFT_MS) {
      throw new AppException(PaymentsErrorCode.PAYMENT_NOT_ALLOWED, 'This order cannot be paid now', HttpStatus.CONFLICT);
    }
    return {
      patientId: order.patientId,
      providerId: null,
      amount: order.total.toNumber(),
      description: `হেলথস্টোর অর্ডার ${order.code}`,
      city: profile.district,
      payerName: order.recipientName,
    };
  }

  /** Paid → PLACED. Paid after it expired: take the stock again if still there, else refund. */
  @OnEvent(PAYMENT_SUCCEEDED_EVENT, { async: true, promisify: true })
  async onPaymentSucceeded(event: PaymentSucceededEvent): Promise<void> {
    if (event.purpose !== 'ORDER') return;
    const order = await this.prisma.order.findUnique({ where: { id: event.referenceId }, include: { items: true } });
    if (!order) return;

    if (order.status === 'PENDING_PAYMENT') {
      const moved = await this.change({
        orderId: order.id,
        from: ['PENDING_PAYMENT'],
        to: 'PLACED',
        note: 'পেমেন্ট সম্পন্ন',
        data: { isPaid: true, holdExpiresAt: null },
      });
      if (moved) await this.notifyStaffNewOrder(order);
      return;
    }
    if (order.status === 'EXPIRED') {
      const placed = await this.prisma.$transaction(async (tx) => {
        const changed = await tx.order.updateMany({
          where: { id: order.id, status: 'EXPIRED' },
          data: { status: 'PLACED', isPaid: true },
        });
        if (changed.count === 0) return false;
        for (const item of order.items) {
          const left = await this.stock.tryMove(tx, {
            productId: item.productId,
            change: -item.qty,
            reason: 'ORDER',
            orderId: order.id,
          });
          if (left === null) throw new StockGone();
        }
        await tx.orderEvent.create({ data: { orderId: order.id, status: 'PLACED', note: 'দেরিতে পেমেন্ট সম্পন্ন' } });
        return true;
      }).catch((error: unknown) => {
        if (error instanceof StockGone) return false;
        throw error;
      });
      if (placed) {
        await this.notifyBuyer(order, 'PLACED');
        await this.notifyStaffNewOrder(order);
      } else {
        await this.prisma.order.updateMany({ where: { id: order.id, status: 'EXPIRED' }, data: { isPaid: true } });
        this.requestRefund(order.id, 'পেমেন্টের আগেই অর্ডারের সময় শেষ হয়ে গিয়েছিল, পণ্যও আর নেই');
      }
      return;
    }
    if (order.status === 'CANCELLED') {
      await this.prisma.order.updateMany({ where: { id: order.id }, data: { isPaid: true } });
      this.requestRefund(order.id, 'পেমেন্টের আগেই অর্ডার বাতিল করা হয়েছিল');
    }
  }

  // -------------------------------------------------------------------------
  // Hold expiry (job + sweep)
  // -------------------------------------------------------------------------

  async expireHold(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.status !== 'PENDING_PAYMENT' || !order.holdExpiresAt) return;
    if (order.holdExpiresAt.getTime() > Date.now()) return;
    const moved = await this.change({
      orderId,
      from: ['PENDING_PAYMENT'],
      to: 'EXPIRED',
      data: { holdExpiresAt: null },
      releaseStock: 'ORDER_RELEASED',
    });
    if (moved) this.logger.log('Order hold expired');
  }

  async expireOverdueHolds(): Promise<number> {
    const overdue = await this.prisma.order.findMany({
      where: { status: 'PENDING_PAYMENT', holdExpiresAt: { lte: new Date() } },
      select: { id: true },
      take: 500,
    });
    for (const row of overdue) await this.expireHold(row.id);
    return overdue.length;
  }

  private async queueHoldExpiry(orderId: string, at: Date): Promise<void> {
    try {
      await this.holds.add(
        EXPIRE_ORDER_HOLD_JOB,
        { orderId },
        {
          jobId: `order-hold-${orderId}`,
          delay: Math.max(0, at.getTime() - Date.now()),
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: true,
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      );
    } catch (error) {
      // The sweep still expires it.
      this.logger.warn(`Could not queue the order hold expiry: ${(error as Error).message}`);
    }
  }

  // -------------------------------------------------------------------------
  // Shared with staff
  // -------------------------------------------------------------------------

  /**
   * Moves an order from one of `from` to `to` in one transaction (status check, timeline,
   * stock back), then tells the buyer. Returns false when the order was not in `from`.
   */
  async change(step: StatusChange): Promise<boolean> {
    const moved = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.order.updateMany({
        where: { id: step.orderId, status: { in: step.from } },
        data: { ...step.data, status: step.to },
      });
      if (changed.count === 0) return false;
      await tx.orderEvent.create({
        data: { orderId: step.orderId, status: step.to, note: step.note ?? null, byUserId: step.byUserId ?? null },
      });
      if (step.releaseStock) {
        const items = await tx.orderItem.findMany({ where: { orderId: step.orderId } });
        for (const item of items) {
          await this.stock.move(tx, {
            productId: item.productId,
            change: item.qty,
            reason: step.releaseStock,
            orderId: step.orderId,
            byUserId: step.byUserId ?? null,
          });
        }
      }
      return true;
    });
    if (moved) {
      const order = await this.prisma.order.findUnique({ where: { id: step.orderId } });
      if (order) await this.notifyBuyer(order, step.to, step.note);
    }
    return moved;
  }

  /** Cancel (buyer or staff): stock back while it still holds stock, refund when paid. */
  async cancel(order: Order, allowed: OrderStatus[], reason: string, byUserId: string): Promise<void> {
    const moved = await this.change({
      orderId: order.id,
      from: allowed,
      to: 'CANCELLED',
      note: reason,
      byUserId,
      data: { cancelReason: reason, holdExpiresAt: null },
      releaseStock: HOLDS_STOCK.includes(order.status) ? 'ORDER_RELEASED' : undefined,
    });
    if (!moved) throw stepNotAllowed();
    if (order.isPaid) this.requestRefund(order.id, reason);
  }

  requestRefund(orderId: string, reason: string): void {
    const event: PaymentRefundRequestedEvent = { purpose: 'ORDER', referenceId: orderId, reason };
    this.events.emit(PAYMENT_REFUND_REQUESTED_EVENT, event);
  }

  async requireDetailed(orderId: string): Promise<OrderWithDetails> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { product: { select: { imageStorageKey: true } } }, orderBy: { id: 'asc' } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) throw orderNotFound();
    return order;
  }

  async view(order: OrderWithDetails): Promise<OrderResponse> {
    const codes = await this.prescriptions.codesByIds(order.prescriptionId ? [order.prescriptionId] : []);
    return {
      ...summary(order, order.items),
      patientId: order.patientId,
      items: order.items.map((i) => ({
        productId: i.productId,
        name: i.name,
        packSize: i.packSize,
        unitPrice: i.unitPrice.toNumber(),
        mrp: i.mrp.toNumber(),
        qty: i.qty,
        lineTotal: i.lineTotal.toNumber(),
        requiresPrescription: i.requiresPrescription,
        imageThumbnailUrl: i.product.imageStorageKey ? this.uploads.thumbnailUrl(i.product.imageStorageKey, 200) : null,
      })),
      subtotal: order.subtotal.toNumber(),
      deliveryCharge: order.deliveryCharge.toNumber(),
      savings: order.savings.toNumber(),
      address: {
        recipientName: order.recipientName,
        phone: order.phone,
        zoneName: order.zoneName,
        area: order.area,
        addressLine: order.addressLine,
      },
      note: order.note,
      holdExpiresAt: order.holdExpiresAt?.toISOString() ?? null,
      prescription: {
        code: order.prescriptionId ? (codes.get(order.prescriptionId) ?? null) : null,
        photoUrl: order.prescriptionStorageKey ? this.uploads.thumbnailUrl(order.prescriptionStorageKey, 800) : null,
        reviewNote: order.prescriptionReviewNote,
      },
      cancelReason: order.cancelReason,
      canCancel: BUYER_CANCELLABLE.includes(order.status),
      timeline: order.events.map((e) => ({ status: e.status, note: e.note, at: e.createdAt.toISOString() })),
    };
  }

  audit(actorUserId: string, order: Pick<Order, 'id' | 'patientId' | 'code'>, action: string): void {
    emitAuditEvent(this.events, {
      actorUserId,
      patientId: order.patientId,
      action,
      entityType: 'Order',
      entityId: order.id,
      meta: { code: order.code },
    });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async requireOwn(userId: string, orderId: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== userId) throw orderNotFound();
    return order;
  }

  private assertPrescriptionEditable(order: Order): void {
    if (order.prescriptionCheck === 'NOT_NEEDED') {
      throw new AppException(ShopErrorCode.PRESCRIPTION_NOT_NEEDED, 'This order needs no prescription');
    }
    if (
      !['PENDING_PAYMENT', 'PLACED'].includes(order.status) ||
      !['AWAITING_PRESCRIPTION', 'PENDING_REVIEW'].includes(order.prescriptionCheck)
    ) {
      throw stepNotAllowed();
    }
  }

  private async requireIssuedPrescription(prescriptionId: string, patientId: string): Promise<void> {
    if (!(await this.prescriptions.issuedForPatient(prescriptionId, patientId))) {
      throw new AppException(ShopErrorCode.PRESCRIPTION_INVALID, 'Not an issued prescription of this profile');
    }
  }

  private async notifyBuyer(order: Order, status: OrderStatus, note?: string | null): Promise<void> {
    try {
      await this.delivery.deliver([
        {
          userId: order.userId,
          patientId: order.patientId,
          type: 'shop.order',
          title: `অর্ডার ${order.code}`,
          body: note && (status === 'CANCELLED' || status === 'RETURNED') ? `${STATUS_TEXT[status]}: ${note}` : STATUS_TEXT[status],
          data: { screen: 'shop-order', orderId: order.id },
          channels: ['PUSH', 'IN_APP'],
        },
      ]);
    } catch (error) {
      this.logger.warn(`Order notification failed: ${(error as Error).message}`);
    }
  }

  /** Staff get a push and in-app note for each new order (and a newly attached prescription). */
  private async notifyStaffNewOrder(order: Order, prescriptionOnly = false): Promise<void> {
    try {
      const staff = await this.accounts.activeStaffUserIds();
      await this.delivery.deliver(
        staff.map((userId) => ({
          userId,
          type: 'shop.staff',
          title: prescriptionOnly ? `প্রেসক্রিপশন দেখুন: ${order.code}` : `নতুন অর্ডার ${order.code}`,
          body: 'প্যানেলের অর্ডার তালিকা দেখুন',
          data: { screen: 'staff-shop-order', orderId: order.id },
          channels: ['PUSH', 'IN_APP'],
        })),
      );
    } catch (error) {
      this.logger.warn(`Staff order notification failed: ${(error as Error).message}`);
    }
  }
}

class StockGone extends Error {}

export function summary(
  order: Order,
  items: { name: string; qty: number }[],
): OrderSummaryResponse {
  return {
    id: order.id,
    code: order.code,
    status: order.status,
    paymentMethod: order.paymentMethod,
    isPaid: order.isPaid,
    itemCount: items.reduce((n, i) => n + i.qty, 0),
    firstItemName: items[0]?.name ?? '',
    total: order.total.toNumber(),
    prescriptionCheck: order.prescriptionCheck,
    createdAt: order.createdAt.toISOString(),
  };
}

export function orderNotFound(): AppException {
  return new AppException(ShopErrorCode.ORDER_NOT_FOUND, 'Order not found', HttpStatus.NOT_FOUND);
}

export function stepNotAllowed(): AppException {
  return new AppException(ShopErrorCode.ORDER_STEP_NOT_ALLOWED, 'The order cannot do this now', HttpStatus.CONFLICT);
}

function cartNotOrderable(problems: unknown): AppException {
  return new AppException(ShopErrorCode.CART_NOT_ORDERABLE, 'The cart cannot be ordered as it is', HttpStatus.CONFLICT, {
    problems,
  });
}
