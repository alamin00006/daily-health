import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { Prisma, type DeliveryAddress, type DeliveryZone, type ShopSetting } from '../../generated/prisma/client.js';
import {
  MAX_DELIVERY_ADDRESSES,
  type CartItemResponse,
  type CartResponse,
  type CheckoutPreviewResponse,
  type CheckoutProblem,
  type CreateDeliveryAddressRequest,
  type DeliveryAddressResponse,
  type UpdateDeliveryAddressRequest,
} from '../../shared-contracts/shop.contract.js';
import { ShopCatalogService, productNotFound } from './shop-catalog.service.js';
import { ShopErrorCode } from './shop-error-codes.js';
import type { ProductWithBrand } from './shop-views.js';

const MAX_CART_LINES = 50;

export interface PricedCart {
  response: CartResponse;
  lines: { product: ProductWithBrand; qty: number }[];
  problems: CheckoutProblem[];
}

/** A buyer's cart, saved addresses and the checkout preview. */
@Injectable()
export class ShopCartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: ShopCatalogService,
  ) {}

  // -------------------------------------------------------------------------
  // Cart
  // -------------------------------------------------------------------------

  async cart(userId: string): Promise<CartResponse> {
    return (await this.priced(userId)).response;
  }

  /** qty 0 removes the line. Above what can be ordered → PRODUCT_UNAVAILABLE with maxQty. */
  async setItem(userId: string, productId: string, qty: number): Promise<CartResponse> {
    if (qty === 0) {
      await this.prisma.cartItem.deleteMany({ where: { userId, productId } });
      return this.cart(userId);
    }
    const product = await this.prisma.product.findFirst({
      where: { id: productId, isActive: true, category: { isActive: true } },
    });
    if (!product) throw productNotFound();
    const maxQty = Math.min(product.stockQty, product.maxPerOrder);
    if (qty > maxQty) {
      throw new AppException(ShopErrorCode.PRODUCT_UNAVAILABLE, 'Not that many available', HttpStatus.CONFLICT, {
        productId,
        maxQty,
      });
    }
    const lines = await this.prisma.cartItem.count({ where: { userId, productId: { not: productId } } });
    if (lines >= MAX_CART_LINES) {
      throw new AppException(ShopErrorCode.PRODUCT_UNAVAILABLE, 'The cart is full', HttpStatus.CONFLICT, {
        productId,
        maxQty: 0,
      });
    }
    await this.prisma.cartItem.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId, qty },
      update: { qty },
    });
    return this.cart(userId);
  }

  async clear(userId: string): Promise<void> {
    await this.prisma.cartItem.deleteMany({ where: { userId } });
  }

  /** The cart with today's prices and what stops it from being ordered. */
  async priced(userId: string, setting?: ShopSetting): Promise<PricedCart> {
    const rows = await this.prisma.cartItem.findMany({
      where: { userId },
      include: { product: { include: { brand: true, category: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const problems: CheckoutProblem[] = [];
    const items: CartItemResponse[] = [];
    const lines: PricedCart['lines'] = [];
    let subtotal = new Prisma.Decimal(0);
    let savings = new Prisma.Decimal(0);
    let requiresPrescription = false;

    for (const row of rows) {
      const p = row.product;
      const sellable = p.isActive && p.category.isActive;
      const maxQty = sellable ? Math.min(p.stockQty, p.maxPerOrder) : 0;
      if (!sellable) problems.push({ productId: p.id, code: 'UNAVAILABLE' });
      else if (maxQty === 0) problems.push({ productId: p.id, code: 'OUT_OF_STOCK' });
      else if (row.qty > maxQty) problems.push({ productId: p.id, code: 'QTY_TOO_HIGH', maxQty });

      const lineTotal = p.price.mul(row.qty);
      items.push({
        product: this.catalog.views.productSummary(p),
        qty: row.qty,
        maxQty,
        lineTotal: lineTotal.toNumber(),
      });
      lines.push({ product: p, qty: row.qty });
      subtotal = subtotal.plus(lineTotal);
      savings = savings.plus(p.mrp.minus(p.price).mul(row.qty));
      if (p.requiresPrescription) requiresPrescription = true;
    }

    if (rows.length === 0) problems.push({ productId: null, code: 'EMPTY_CART' });
    else if (setting && subtotal.lt(setting.minOrderAmount)) {
      problems.push({ productId: null, code: 'BELOW_MIN_ORDER' });
    }

    return {
      response: {
        items,
        itemCount: rows.reduce((n, r) => n + r.qty, 0),
        subtotal: subtotal.toNumber(),
        savings: savings.toNumber(),
        requiresPrescription,
      },
      lines,
      problems,
    };
  }

  async preview(userId: string, setting: ShopSetting, addressId?: string): Promise<CheckoutPreviewResponse> {
    const cart = await this.priced(userId, setting);
    let deliveryCharge: number | null = null;
    if (addressId) {
      const address = await this.requireAddress(userId, addressId);
      deliveryCharge = deliveryChargeFor(address.zone, setting, cart.response.subtotal).toNumber();
    }
    return {
      cart: cart.response,
      deliveryCharge,
      total: deliveryCharge === null ? null : cart.response.subtotal + deliveryCharge,
      cashOnDeliveryAvailable: setting.cashOnDeliveryEnabled,
      minOrderAmount: setting.minOrderAmount.toNumber(),
      freeDeliveryFrom: setting.freeDeliveryFrom?.toNumber() ?? null,
      problems: cart.problems,
    };
  }

  // -------------------------------------------------------------------------
  // Addresses
  // -------------------------------------------------------------------------

  async addresses(userId: string): Promise<DeliveryAddressResponse[]> {
    const rows = await this.prisma.deliveryAddress.findMany({
      where: { userId },
      include: { zone: true },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
    return rows.map((r) => this.address(r));
  }

  async createAddress(userId: string, input: CreateDeliveryAddressRequest): Promise<DeliveryAddressResponse> {
    await this.requireActiveZone(input.zoneId);
    const row = await this.prisma.$transaction(async (tx) => {
      const count = await tx.deliveryAddress.count({ where: { userId } });
      if (count >= MAX_DELIVERY_ADDRESSES) {
        throw new AppException(ShopErrorCode.DELIVERY_ADDRESS_LIMIT, 'At most 10 addresses', HttpStatus.CONFLICT);
      }
      // The first address is the default one.
      const isDefault = input.isDefault || count === 0;
      if (isDefault) await tx.deliveryAddress.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      return tx.deliveryAddress.create({
        data: { ...input, userId, isDefault },
        include: { zone: true },
      });
    });
    return this.address(row);
  }

  async updateAddress(
    userId: string,
    addressId: string,
    input: UpdateDeliveryAddressRequest,
  ): Promise<DeliveryAddressResponse> {
    await this.requireAddress(userId, addressId);
    if (input.zoneId) await this.requireActiveZone(input.zoneId);
    const row = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.deliveryAddress.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      }
      return tx.deliveryAddress.update({
        where: { id: addressId },
        // The default cannot be turned off directly: make another one the default instead.
        data: { ...input, ...(input.isDefault === false ? { isDefault: undefined } : {}) },
        include: { zone: true },
      });
    });
    return this.address(row);
  }

  async removeAddress(userId: string, addressId: string): Promise<void> {
    const row = await this.requireAddress(userId, addressId);
    await this.prisma.$transaction(async (tx) => {
      await tx.deliveryAddress.delete({ where: { id: addressId } });
      if (row.isDefault) {
        const next = await tx.deliveryAddress.findFirst({ where: { userId }, orderBy: { updatedAt: 'desc' } });
        if (next) await tx.deliveryAddress.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
  }

  async requireAddress(userId: string, addressId: string): Promise<DeliveryAddress & { zone: DeliveryZone }> {
    const row = await this.prisma.deliveryAddress.findFirst({
      where: { id: addressId, userId },
      include: { zone: true },
    });
    if (!row) {
      throw new AppException(ShopErrorCode.DELIVERY_ADDRESS_NOT_FOUND, 'Address not found', HttpStatus.NOT_FOUND);
    }
    return row;
  }

  private async requireActiveZone(zoneId: string): Promise<void> {
    const zone = await this.prisma.deliveryZone.findFirst({ where: { id: zoneId, isActive: true } });
    if (!zone) {
      throw new AppException(ShopErrorCode.DELIVERY_ZONE_NOT_FOUND, 'Delivery zone not found', HttpStatus.NOT_FOUND);
    }
  }

  private address(row: DeliveryAddress & { zone: DeliveryZone }): DeliveryAddressResponse {
    return {
      id: row.id,
      label: row.label,
      recipientName: row.recipientName,
      phone: row.phone,
      zone: this.catalog.views.zone(row.zone),
      area: row.area,
      addressLine: row.addressLine,
      isDefault: row.isDefault,
    };
  }
}

/** Zone charge, or free from the shop's free-delivery amount. */
export function deliveryChargeFor(zone: DeliveryZone, setting: ShopSetting, subtotal: number): Prisma.Decimal {
  if (setting.freeDeliveryFrom && setting.freeDeliveryFrom.lte(subtotal)) return new Prisma.Decimal(0);
  return zone.charge;
}
