import { apiRequest, apiUpload, type UploadFile } from './http-client';
import { buildQuery } from './query-string';

import type { PaginatedResponse } from '@/shared-contracts/common-fields.contract';
import type {
  BrandResponse,
  CartResponse,
  CheckoutPreviewResponse,
  CreateDeliveryAddressRequest,
  DeliveryAddressResponse,
  DeliveryZoneResponse,
  OrderResponse,
  OrderStatus,
  OrderSummaryResponse,
  PlaceOrderRequest,
  ProductCategoryResponse,
  ProductResponse,
  ProductSort,
  ProductSummaryResponse,
  ShopHomeResponse,
  ShopStatusResponse,
  UpdateDeliveryAddressRequest,
} from '@/shared-contracts/shop.contract';

const auth = { authenticated: true } as const;

export interface ProductListParams {
  q?: string;
  categoryId?: string;
  brandId?: string;
  trending?: boolean;
  sort?: ProductSort;
  cursor?: string;
}

/** HealthStore. The catalog is public (guests too); cart and orders need an account. */
export const shopEndpoints = {
  status: () => apiRequest<ShopStatusResponse>('/shop/status'),
  home: () => apiRequest<ShopHomeResponse>('/shop/home'),
  categories: () => apiRequest<ProductCategoryResponse[]>('/shop/categories'),
  brands: () => apiRequest<BrandResponse[]>('/shop/brands'),
  zones: () => apiRequest<DeliveryZoneResponse[]>('/shop/delivery-zones'),
  products: (params: ProductListParams) =>
    apiRequest<PaginatedResponse<ProductSummaryResponse>>(
      `/shop/products${buildQuery({ limit: 20, ...params, trending: params.trending ? 'true' : undefined })}`
    ),
  product: (productId: string) => apiRequest<ProductResponse>(`/shop/products/${productId}`),

  cart: () => apiRequest<CartResponse>('/shop/cart', auth),
  setCartItem: (productId: string, qty: number) =>
    apiRequest<CartResponse>(`/shop/cart/items/${productId}`, { ...auth, method: 'PUT', body: { qty } }),
  clearCart: () => apiRequest<void>('/shop/cart', { ...auth, method: 'DELETE' }),

  addresses: () => apiRequest<DeliveryAddressResponse[]>('/shop/addresses', auth),
  createAddress: (body: CreateDeliveryAddressRequest) =>
    apiRequest<DeliveryAddressResponse>('/shop/addresses', { ...auth, method: 'POST', body }),
  updateAddress: (addressId: string, body: UpdateDeliveryAddressRequest) =>
    apiRequest<DeliveryAddressResponse>(`/shop/addresses/${addressId}`, { ...auth, method: 'PATCH', body }),
  removeAddress: (addressId: string) =>
    apiRequest<void>(`/shop/addresses/${addressId}`, { ...auth, method: 'DELETE' }),

  preview: (addressId?: string) =>
    apiRequest<CheckoutPreviewResponse>('/shop/checkout/preview', { ...auth, method: 'POST', body: { addressId } }),
  placeOrder: (body: PlaceOrderRequest) =>
    apiRequest<OrderResponse>('/shop/orders', { ...auth, method: 'POST', body }),
  orders: (params: { status?: OrderStatus; cursor?: string }) =>
    apiRequest<PaginatedResponse<OrderSummaryResponse>>(`/shop/orders${buildQuery({ limit: 20, ...params })}`, auth),
  order: (orderId: string) => apiRequest<OrderResponse>(`/shop/orders/${orderId}`, auth),
  cancelOrder: (orderId: string, reason: string) =>
    apiRequest<OrderResponse>(`/shop/orders/${orderId}/cancel`, { ...auth, method: 'POST', body: { reason } }),
  attachPrescriptionPhoto: (orderId: string, file: UploadFile) =>
    apiUpload<OrderResponse>(`/shop/orders/${orderId}/prescription`, file, {}, 'PUT'),
  linkPrescription: (orderId: string, prescriptionId: string) =>
    apiRequest<OrderResponse>(`/shop/orders/${orderId}/prescription-link`, {
      ...auth,
      method: 'POST',
      body: { prescriptionId },
    }),
};
