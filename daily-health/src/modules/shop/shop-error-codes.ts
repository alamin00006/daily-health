/** Error codes of the shop module. The app maps each to Bangla text; never rename. */
export const ShopErrorCode = {
  /** The admins switched the shop off. */
  SHOP_DISABLED: 'SHOP_DISABLED',
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  PRODUCT_CATEGORY_NOT_FOUND: 'PRODUCT_CATEGORY_NOT_FOUND',
  BRAND_NOT_FOUND: 'BRAND_NOT_FOUND',
  DELIVERY_ZONE_NOT_FOUND: 'DELIVERY_ZONE_NOT_FOUND',
  DELIVERY_ADDRESS_NOT_FOUND: 'DELIVERY_ADDRESS_NOT_FOUND',
  DELIVERY_ADDRESS_LIMIT: 'DELIVERY_ADDRESS_LIMIT',
  SHOP_BANNER_NOT_FOUND: 'SHOP_BANNER_NOT_FOUND',
  DISCOUNT_PARTNER_NOT_FOUND: 'DISCOUNT_PARTNER_NOT_FOUND',
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  /** Slug or SKU already used. */
  SHOP_CODE_TAKEN: 'SHOP_CODE_TAKEN',
  /** A category, brand or zone still used by products or addresses. */
  SHOP_ITEM_IN_USE: 'SHOP_ITEM_IN_USE',
  /** The product cannot be sold now (inactive, out of stock, above the limit). */
  PRODUCT_UNAVAILABLE: 'PRODUCT_UNAVAILABLE',
  /** The cart cannot be ordered as it is (details list the problems). */
  CART_NOT_ORDERABLE: 'CART_NOT_ORDERABLE',
  CASH_ON_DELIVERY_UNAVAILABLE: 'CASH_ON_DELIVERY_UNAVAILABLE',
  /** Stock change would take it below zero. */
  STOCK_TOO_LOW: 'STOCK_TOO_LOW',
  /** The order is past the point where this can be done. */
  ORDER_STEP_NOT_ALLOWED: 'ORDER_STEP_NOT_ALLOWED',
  /** No prescription-only medicine in the order. */
  PRESCRIPTION_NOT_NEEDED: 'PRESCRIPTION_NOT_NEEDED',
  /** Not an issued prescription of the order's profile. */
  PRESCRIPTION_INVALID: 'PRESCRIPTION_INVALID',
  /** Staff cannot review before a photo or an RX is attached. */
  PRESCRIPTION_MISSING: 'PRESCRIPTION_MISSING',
} as const;
