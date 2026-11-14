import { z } from 'zod';
import { bangladeshPhoneSchema, paginationQuerySchema } from './common-fields.contract.js';

/**
 * HealthStore (শপ): our own stock, our own delivery (CLAUDE.md §1, feature 10).
 * Admins switch the whole shop on or off; while off the public shop API answers
 * SHOP_DISABLED and the app hides it, but the panel keeps working.
 */

const money = z.coerce.number().min(0).max(9_999_999).multipleOf(0.01);
const positiveMoney = money.refine((v) => v > 0, 'Must be more than 0');
const name = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** The tag on a category tile ("Trending", "Must have", …). */
export const categoryBadgeSchema = z.enum(['TRENDING', 'MUST_HAVE', 'POPULAR', 'FEATURED', 'BEST_SELLER']);
export type CategoryBadge = z.infer<typeof categoryBadgeSchema>;

export const orderStatusSchema = z.enum([
  /** Online payment not done yet; stock is held until holdExpiresAt. */
  'PENDING_PAYMENT',
  /** Paid, or cash on delivery: waiting for staff (and the prescription check). */
  'PLACED',
  /** Staff accepted it and are packing it. */
  'CONFIRMED',
  /** Out for delivery. */
  'DISPATCHED',
  'DELIVERED',
  'CANCELLED',
  /** Unpaid in time. */
  'EXPIRED',
  /** Came back after delivery, refunded. */
  'RETURNED',
]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const orderPaymentMethodSchema = z.enum(['ONLINE', 'CASH_ON_DELIVERY']);
export type OrderPaymentMethod = z.infer<typeof orderPaymentMethodSchema>;

export const prescriptionCheckSchema = z.enum([
  /** No prescription-only medicine in the order. */
  'NOT_NEEDED',
  /** Needs a prescription photo or an issued RX-… before staff can review it. */
  'AWAITING_PRESCRIPTION',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
]);
export type PrescriptionCheck = z.infer<typeof prescriptionCheckSchema>;

export const stockMovementReasonSchema = z.enum([
  'RESTOCK',
  'ORDER',
  'ORDER_RELEASED',
  'RETURNED',
  'ADJUSTMENT',
  'DAMAGED',
  'EXPIRED_STOCK',
]);
export type StockMovementReason = z.infer<typeof stockMovementReasonSchema>;
/** What staff may record by hand (ORDER / ORDER_RELEASED / RETURNED come from orders). */
export const manualStockReasonSchema = z.enum(['RESTOCK', 'ADJUSTMENT', 'DAMAGED', 'EXPIRED_STOCK']);

export const bannerLinkTypeSchema = z.enum(['NONE', 'CATEGORY', 'PRODUCT', 'BRAND', 'URL']);
export type BannerLinkType = z.infer<typeof bannerLinkTypeSchema>;

export const productSortSchema = z.enum(['RELEVANCE', 'NEWEST', 'PRICE_LOW', 'PRICE_HIGH', 'DISCOUNT']);
export type ProductSort = z.infer<typeof productSortSchema>;

// ---------------------------------------------------------------------------
// Settings (on/off)
// ---------------------------------------------------------------------------

// GET /api/v1/shop/status (always answers, guests too)
export interface ShopStatusResponse {
  enabled: boolean;
}

export interface ShopSettingsResponse {
  enabled: boolean;
  cashOnDeliveryEnabled: boolean;
  /** Smallest subtotal that can be ordered (0 = no limit). */
  minOrderAmount: number;
  /** Free delivery from this subtotal; null = never free. */
  freeDeliveryFrom: number | null;
  /** Minutes an unpaid online order holds its stock. */
  paymentHoldMinutes: number;
  updatedAt: string;
  updatedByName: string | null;
}

// PATCH /api/v1/staff/shop/settings (ADMIN)
export const updateShopSettingsRequestSchema = z
  .object({
    enabled: z.boolean(),
    cashOnDeliveryEnabled: z.boolean(),
    minOrderAmount: money,
    freeDeliveryFrom: money.nullable(),
    paymentHoldMinutes: z.coerce.number().int().min(5).max(60),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');
export type UpdateShopSettingsRequest = z.infer<typeof updateShopSettingsRequestSchema>;

export interface ShopSettingsChangeResponse {
  id: string;
  /** Only the fields that changed: { field: [before, after] }. */
  changes: Record<string, [unknown, unknown]>;
  changedByName: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Catalog: categories, brands, products
// ---------------------------------------------------------------------------

export interface ProductCategoryResponse {
  id: string;
  name: string;
  slug: string;
  badge: CategoryBadge | null;
  imageThumbnailUrl: string | null;
  productCount: number;
}
export interface StaffProductCategoryResponse extends ProductCategoryResponse {
  sortOrder: number;
  isActive: boolean;
  /** Only shown as a home section ("ঔষধ") when true. */
  showOnHome: boolean;
}

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Lowercase letters, digits and hyphens')
  .max(60);

export const createProductCategoryRequestSchema = z.object({
  name: name(60),
  slug: slugSchema,
  badge: categoryBadgeSchema.nullable().default(null),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
  showOnHome: z.boolean().default(false),
});
export type CreateProductCategoryRequest = z.infer<typeof createProductCategoryRequestSchema>;
export const updateProductCategoryRequestSchema = createProductCategoryRequestSchema.partial();
export type UpdateProductCategoryRequest = z.infer<typeof updateProductCategoryRequestSchema>;

export interface BrandResponse {
  id: string;
  name: string;
  slug: string;
  logoThumbnailUrl: string | null;
}
export interface StaffBrandResponse extends BrandResponse {
  isFeatured: boolean;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
}
export const createBrandRequestSchema = z.object({
  name: name(60),
  slug: slugSchema,
  isFeatured: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
});
export type CreateBrandRequest = z.infer<typeof createBrandRequestSchema>;
export const updateBrandRequestSchema = createBrandRequestSchema.partial();
export type UpdateBrandRequest = z.infer<typeof updateBrandRequestSchema>;

/** A product card (lists, home sections). */
export interface ProductSummaryResponse {
  id: string;
  name: string;
  /** "Napa 500 mg" → generic "Paracetamol". */
  genericName: string | null;
  strength: string | null;
  /** "১০টি ট্যাবলেট", "১ বোতল (৬০ মিলি)". */
  packSize: string | null;
  brandName: string | null;
  price: number;
  mrp: number;
  /** Rounded percent off the MRP (0 when none). */
  discountPercent: number;
  inStock: boolean;
  requiresPrescription: boolean;
  imageThumbnailUrl: string | null;
}

export interface ProductResponse extends ProductSummaryResponse {
  description: string | null;
  dosageForm: string | null;
  manufacturer: string | null;
  category: Pick<ProductCategoryResponse, 'id' | 'name' | 'slug'>;
  brand: BrandResponse | null;
  imageUrl: string | null;
  /** The most one order can take (stock and per-order limit). */
  maxQty: number;
}

export interface StaffProductResponse extends ProductResponse {
  sku: string;
  stockQty: number;
  lowStockThreshold: number;
  maxPerOrder: number;
  isTrending: boolean;
  isActive: boolean;
  isLowStock: boolean;
  createdAt: string;
  updatedAt: string;
}

// GET /api/v1/shop/products?q=&categoryId=&brandId=&trending=&sort=
export const listProductsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(80).optional(),
  categoryId: z.uuid().optional(),
  brandId: z.uuid().optional(),
  trending: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  sort: productSortSchema.default('RELEVANCE'),
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

// GET /api/v1/staff/shop/products
export const listStaffProductsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(80).optional(),
  categoryId: z.uuid().optional(),
  brandId: z.uuid().optional(),
  stock: z.enum(['LOW', 'OUT']).optional(),
  active: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
export type ListStaffProductsQuery = z.infer<typeof listStaffProductsQuerySchema>;

export const createProductRequestSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9-]{1,39}$/, 'Letters, digits and hyphens'),
    name: name(120),
    genericName: optionalText(120),
    strength: optionalText(40),
    dosageForm: optionalText(40),
    packSize: optionalText(60),
    manufacturer: optionalText(80),
    description: optionalText(4000),
    categoryId: z.uuid(),
    brandId: z.uuid().nullable().default(null),
    mrp: positiveMoney,
    price: positiveMoney,
    lowStockThreshold: z.coerce.number().int().min(0).max(100_000).default(5),
    maxPerOrder: z.coerce.number().int().min(1).max(100).default(10),
    requiresPrescription: z.boolean().default(false),
    isTrending: z.boolean().default(false),
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.price <= v.mrp, { path: ['price'], message: 'Price cannot be above the MRP' });
export type CreateProductRequest = z.infer<typeof createProductRequestSchema>;

export const updateProductRequestSchema = z
  .object({
    name: name(120),
    genericName: optionalText(120),
    strength: optionalText(40),
    dosageForm: optionalText(40),
    packSize: optionalText(60),
    manufacturer: optionalText(80),
    description: optionalText(4000),
    categoryId: z.uuid(),
    brandId: z.uuid().nullable(),
    mrp: positiveMoney,
    price: positiveMoney,
    lowStockThreshold: z.coerce.number().int().min(0).max(100_000),
    maxPerOrder: z.coerce.number().int().min(1).max(100),
    requiresPrescription: z.boolean(),
    isTrending: z.boolean(),
    isActive: z.boolean(),
  })
  .partial();
export type UpdateProductRequest = z.infer<typeof updateProductRequestSchema>;

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

// POST /api/v1/staff/shop/products/:productId/stock
export const adjustStockRequestSchema = z
  .object({
    /** + for stock in, - for stock out. */
    change: z.coerce.number().int().min(-100_000).max(100_000),
    reason: manualStockReasonSchema,
    note: optionalText(300),
  })
  .refine((v) => v.change !== 0, { path: ['change'], message: 'Cannot be 0' })
  .refine((v) => v.reason !== 'RESTOCK' || v.change > 0, { path: ['change'], message: 'Restock adds stock' })
  .refine((v) => (v.reason !== 'DAMAGED' && v.reason !== 'EXPIRED_STOCK') || v.change < 0, {
    path: ['change'],
    message: 'Damaged or expired stock is taken out',
  });
export type AdjustStockRequest = z.infer<typeof adjustStockRequestSchema>;

export interface StockMovementResponse {
  id: string;
  change: number;
  /** Stock right after this movement. */
  balanceAfter: number;
  reason: StockMovementReason;
  note: string | null;
  orderCode: string | null;
  byName: string | null;
  createdAt: string;
}

export const listStockMovementsQuerySchema = paginationQuerySchema;

// ---------------------------------------------------------------------------
// Home extras: banners, discount partners
// ---------------------------------------------------------------------------

export interface ShopBannerResponse {
  id: string;
  title: string;
  imageUrl: string | null;
  linkType: BannerLinkType;
  /** Category/product/brand id, or an https URL. */
  linkValue: string | null;
}
export interface StaffShopBannerResponse extends ShopBannerResponse {
  sortOrder: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
}
const bannerFields = z.object({
  title: name(80),
  linkType: bannerLinkTypeSchema.default('NONE'),
  linkValue: optionalText(500),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
  startsAt: z.iso.datetime({ offset: true }).nullable().default(null),
  endsAt: z.iso.datetime({ offset: true }).nullable().default(null),
});
const checkBannerLink = (v: { linkType?: BannerLinkType; linkValue?: string | null }) =>
  v.linkType === undefined ||
  v.linkType === 'NONE' ||
  (v.linkType === 'URL'
    ? /^https:\/\/\S+$/.test(v.linkValue ?? '')
    : z.uuid().safeParse(v.linkValue).success);
export const createShopBannerRequestSchema = bannerFields.refine(checkBannerLink, {
  path: ['linkValue'],
  message: 'An https link, or the id of what it opens',
});
export type CreateShopBannerRequest = z.infer<typeof createShopBannerRequestSchema>;
export const updateShopBannerRequestSchema = bannerFields.partial().refine(checkBannerLink, {
  path: ['linkValue'],
  message: 'An https link, or the id of what it opens',
});
export type UpdateShopBannerRequest = z.infer<typeof updateShopBannerRequestSchema>;

export interface DiscountPartnerResponse {
  id: string;
  name: string;
  /** "সব টেস্টে ২০% ছাড়" */
  offerText: string;
  description: string | null;
  address: string | null;
  phone: string | null;
  logoThumbnailUrl: string | null;
}
export interface StaffDiscountPartnerResponse extends DiscountPartnerResponse {
  sortOrder: number;
  isActive: boolean;
}
export const createDiscountPartnerRequestSchema = z.object({
  name: name(80),
  offerText: name(120),
  description: optionalText(1000),
  address: optionalText(200),
  phone: bangladeshPhoneSchema.nullable().default(null),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
});
export type CreateDiscountPartnerRequest = z.infer<typeof createDiscountPartnerRequestSchema>;
export const updateDiscountPartnerRequestSchema = createDiscountPartnerRequestSchema.partial();
export type UpdateDiscountPartnerRequest = z.infer<typeof updateDiscountPartnerRequestSchema>;

// GET /api/v1/shop/home
export interface ShopHomeResponse {
  banners: ShopBannerResponse[];
  categories: ProductCategoryResponse[];
  trending: ProductSummaryResponse[];
  /** Categories marked "show on home", each with its first products. */
  sections: { category: Pick<ProductCategoryResponse, 'id' | 'name' | 'slug'>; products: ProductSummaryResponse[] }[];
  featuredBrands: BrandResponse[];
  partners: DiscountPartnerResponse[];
}

// ---------------------------------------------------------------------------
// Delivery zones and addresses
// ---------------------------------------------------------------------------

export interface DeliveryZoneResponse {
  id: string;
  /** "ঢাকা সিটির ভেতরে" */
  name: string;
  charge: number;
  /** "১–২ দিন" */
  estimate: string | null;
}
export interface StaffDeliveryZoneResponse extends DeliveryZoneResponse {
  sortOrder: number;
  isActive: boolean;
}
export const createDeliveryZoneRequestSchema = z.object({
  name: name(60),
  charge: money,
  estimate: optionalText(40),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
});
export type CreateDeliveryZoneRequest = z.infer<typeof createDeliveryZoneRequestSchema>;
export const updateDeliveryZoneRequestSchema = createDeliveryZoneRequestSchema.partial();
export type UpdateDeliveryZoneRequest = z.infer<typeof updateDeliveryZoneRequestSchema>;

export interface DeliveryAddressResponse {
  id: string;
  /** "বাসা", "অফিস" */
  label: string | null;
  recipientName: string;
  phone: string;
  zone: DeliveryZoneResponse;
  area: string;
  addressLine: string;
  isDefault: boolean;
}
export const MAX_DELIVERY_ADDRESSES = 10;
export const createDeliveryAddressRequestSchema = z.object({
  label: optionalText(30),
  recipientName: name(80),
  phone: bangladeshPhoneSchema,
  zoneId: z.uuid(),
  area: name(80),
  addressLine: name(300),
  isDefault: z.boolean().default(false),
});
export type CreateDeliveryAddressRequest = z.infer<typeof createDeliveryAddressRequestSchema>;
export const updateDeliveryAddressRequestSchema = createDeliveryAddressRequestSchema.partial();
export type UpdateDeliveryAddressRequest = z.infer<typeof updateDeliveryAddressRequestSchema>;

// ---------------------------------------------------------------------------
// Cart and checkout
// ---------------------------------------------------------------------------

export interface CartItemResponse {
  product: ProductSummaryResponse;
  qty: number;
  /** The most that can be ordered now (0 = unavailable). */
  maxQty: number;
  lineTotal: number;
}
export interface CartResponse {
  items: CartItemResponse[];
  itemCount: number;
  subtotal: number;
  /** Sum of (MRP − price) × qty. */
  savings: number;
  requiresPrescription: boolean;
}

// PUT /api/v1/shop/cart/items/:productId   (qty 0 removes it)
export const setCartItemRequestSchema = z.object({
  qty: z.coerce.number().int().min(0).max(100),
});
export type SetCartItemRequest = z.infer<typeof setCartItemRequestSchema>;

/** Something in the cart that stops checkout; the app shows it on the line. */
export interface CheckoutProblem {
  productId: string | null;
  code: 'OUT_OF_STOCK' | 'QTY_TOO_HIGH' | 'UNAVAILABLE' | 'BELOW_MIN_ORDER' | 'EMPTY_CART';
  /** For QTY_TOO_HIGH: what can be ordered. */
  maxQty?: number;
}

// POST /api/v1/shop/checkout/preview
export const checkoutPreviewRequestSchema = z.object({
  addressId: z.uuid().optional(),
});
export type CheckoutPreviewRequest = z.infer<typeof checkoutPreviewRequestSchema>;
export interface CheckoutPreviewResponse {
  cart: CartResponse;
  deliveryCharge: number | null;
  total: number | null;
  cashOnDeliveryAvailable: boolean;
  minOrderAmount: number;
  freeDeliveryFrom: number | null;
  problems: CheckoutProblem[];
}

// POST /api/v1/shop/orders   (from the cart)
export const placeOrderRequestSchema = z.object({
  /** Whose care the order is for (a profile the buyer can edit). */
  patientId: z.uuid(),
  addressId: z.uuid(),
  paymentMethod: orderPaymentMethodSchema,
  /** An issued prescription of that profile, for prescription-only medicines. */
  prescriptionId: z.uuid().optional(),
  note: optionalText(300),
});
export type PlaceOrderRequest = z.infer<typeof placeOrderRequestSchema>;

// POST /api/v1/shop/orders/:orderId/prescription-link
export const linkOrderPrescriptionRequestSchema = z.object({
  prescriptionId: z.uuid(),
});
export type LinkOrderPrescriptionRequest = z.infer<typeof linkOrderPrescriptionRequestSchema>;

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export interface OrderItemResponse {
  productId: string;
  name: string;
  packSize: string | null;
  unitPrice: number;
  mrp: number;
  qty: number;
  lineTotal: number;
  requiresPrescription: boolean;
  imageThumbnailUrl: string | null;
}

export interface OrderTimelineEntry {
  status: OrderStatus;
  note: string | null;
  at: string;
}

export interface OrderSummaryResponse {
  id: string;
  /** "OD-2611-0042" */
  code: string;
  status: OrderStatus;
  paymentMethod: OrderPaymentMethod;
  /** true once an online payment went through. */
  isPaid: boolean;
  itemCount: number;
  firstItemName: string;
  total: number;
  prescriptionCheck: PrescriptionCheck;
  createdAt: string;
}

export interface OrderResponse extends OrderSummaryResponse {
  patientId: string;
  items: OrderItemResponse[];
  subtotal: number;
  deliveryCharge: number;
  savings: number;
  address: {
    recipientName: string;
    phone: string;
    zoneName: string;
    area: string;
    addressLine: string;
  };
  note: string | null;
  /** Unpaid online order: pay before this or it expires. */
  holdExpiresAt: string | null;
  prescription: {
    /** The linked issued prescription. */
    code: string | null;
    /** Signed link to the uploaded photo (expires). */
    photoUrl: string | null;
    reviewNote: string | null;
  };
  cancelReason: string | null;
  canCancel: boolean;
  timeline: OrderTimelineEntry[];
}

export const listMyOrdersQuerySchema = paginationQuerySchema.extend({
  status: orderStatusSchema.optional(),
});
export type ListMyOrdersQuery = z.infer<typeof listMyOrdersQuerySchema>;

export const cancelOrderRequestSchema = z.object({
  reason: z.string().trim().min(2).max(300),
});
export type CancelOrderRequest = z.infer<typeof cancelOrderRequestSchema>;

/** Staff view of an order: who ordered, for whom. */
export interface StaffOrderResponse extends OrderResponse {
  buyerName: string | null;
  patientCode: string | null;
  patientName: string | null;
}

export const listStaffOrdersQuerySchema = paginationQuerySchema.extend({
  status: orderStatusSchema.optional(),
  /** Orders whose prescription waits for review. */
  prescription: z.enum(['PENDING_REVIEW']).optional(),
  q: z.string().trim().max(40).optional(),
});
export type ListStaffOrdersQuery = z.infer<typeof listStaffOrdersQuerySchema>;

// POST /api/v1/staff/shop/orders/:orderId/prescription-review
export const reviewOrderPrescriptionRequestSchema = z
  .object({
    approve: z.boolean(),
    note: optionalText(300),
  })
  .refine((v) => v.approve || (v.note && v.note.length >= 2), {
    path: ['note'],
    message: 'Say why it is rejected',
  });
export type ReviewOrderPrescriptionRequest = z.infer<typeof reviewOrderPrescriptionRequestSchema>;

// POST /api/v1/staff/shop/orders/:orderId/{confirm,dispatch,deliver}
export const orderStepRequestSchema = z.object({
  note: optionalText(300),
});
export type OrderStepRequest = z.infer<typeof orderStepRequestSchema>;

// POST /api/v1/staff/shop/orders/:orderId/return (ADMIN; after delivery)
export const returnOrderRequestSchema = z.object({
  reason: z.string().trim().min(2).max(300),
  /** Put the items back into stock (unopened). */
  restock: z.boolean(),
});
export type ReturnOrderRequest = z.infer<typeof returnOrderRequestSchema>;

export interface ShopStaffCountsResponse {
  ordersToHandle: number;
  prescriptionsToReview: number;
  lowStockProducts: number;
  outOfStockProducts: number;
}
