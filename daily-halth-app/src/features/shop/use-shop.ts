import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { UploadFile } from '@/api/http-client';
import { shopEndpoints, type ProductListParams } from '@/api/shop-endpoints';
import type {
  CartResponse,
  CreateDeliveryAddressRequest,
  OrderResponse,
  PlaceOrderRequest,
  UpdateDeliveryAddressRequest,
} from '@/shared-contracts/shop.contract';
import { useSessionStore } from '@/stores/session-store';

export const shopKeys = {
  status: ['shop', 'status'] as const,
  home: ['shop', 'home'] as const,
  categories: ['shop', 'categories'] as const,
  zones: ['shop', 'zones'] as const,
  products: (params: ProductListParams) => ['shop', 'products', params] as const,
  product: (id: string) => ['shop', 'product', id] as const,
  cart: ['shop', 'cart'] as const,
  addresses: ['shop', 'addresses'] as const,
  preview: (addressId: string | undefined) => ['shop', 'preview', addressId ?? ''] as const,
  orders: ['shop', 'orders'] as const,
  order: (id: string) => ['shop', 'order', id] as const,
};

export function useIsRegistered(): boolean {
  return useSessionStore((s) => s.status === 'signedIn' && !s.user?.isGuest);
}

/** Admins switch the whole shop on or off; the app shows nothing of it while off. */
export function useShopEnabled(): boolean {
  const status = useQuery({
    queryKey: shopKeys.status,
    queryFn: shopEndpoints.status,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  return status.data?.enabled === true;
}

export function useShopHome() {
  return useQuery({ queryKey: shopKeys.home, queryFn: shopEndpoints.home, staleTime: 60_000 });
}

export function useShopCategories() {
  return useQuery({ queryKey: shopKeys.categories, queryFn: shopEndpoints.categories, staleTime: 5 * 60_000 });
}

export function useDeliveryZones() {
  return useQuery({ queryKey: shopKeys.zones, queryFn: shopEndpoints.zones, staleTime: 5 * 60_000 });
}

export function useProducts(params: ProductListParams, enabled = true) {
  return useInfiniteQuery({
    queryKey: shopKeys.products(params),
    queryFn: ({ pageParam }) => shopEndpoints.products({ ...params, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.cursor ?? undefined) : undefined),
    enabled,
  });
}

export function useProduct(productId: string) {
  return useQuery({ queryKey: shopKeys.product(productId), queryFn: () => shopEndpoints.product(productId) });
}

// --- Cart ---------------------------------------------------------------------------

export function useCart() {
  const registered = useIsRegistered();
  return useQuery({ queryKey: shopKeys.cart, queryFn: shopEndpoints.cart, enabled: registered });
}

export function useSetCartItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, qty }: { productId: string; qty: number }) => shopEndpoints.setCartItem(productId, qty),
    onSuccess: (cart: CartResponse) => {
      client.setQueryData(shopKeys.cart, cart);
      void client.invalidateQueries({ queryKey: ['shop', 'preview'] });
    },
  });
}

// --- Addresses ------------------------------------------------------------------------

export function useAddresses() {
  const registered = useIsRegistered();
  return useQuery({ queryKey: shopKeys.addresses, queryFn: shopEndpoints.addresses, enabled: registered });
}

export function useAddressActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: shopKeys.addresses });
  return {
    create: useMutation({
      mutationFn: (body: CreateDeliveryAddressRequest) => shopEndpoints.createAddress(body),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: UpdateDeliveryAddressRequest }) =>
        shopEndpoints.updateAddress(id, body),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: (id: string) => shopEndpoints.removeAddress(id), onSuccess: refresh }),
  };
}

// --- Checkout and orders --------------------------------------------------------------

export function useCheckoutPreview(addressId: string | undefined) {
  return useQuery({ queryKey: shopKeys.preview(addressId), queryFn: () => shopEndpoints.preview(addressId) });
}

export function usePlaceOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: PlaceOrderRequest) => shopEndpoints.placeOrder(body),
    onSuccess: (order) => {
      client.setQueryData(shopKeys.order(order.id), order);
      void client.invalidateQueries({ queryKey: shopKeys.cart });
      void client.invalidateQueries({ queryKey: shopKeys.orders });
      // Stock changed.
      void client.invalidateQueries({ queryKey: ['shop', 'products'] });
      void client.invalidateQueries({ queryKey: shopKeys.home });
    },
  });
}

export function useMyOrders() {
  const registered = useIsRegistered();
  return useInfiniteQuery({
    queryKey: shopKeys.orders,
    queryFn: ({ pageParam }) => shopEndpoints.orders({ cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.cursor ?? undefined) : undefined),
    enabled: registered,
  });
}

export function useOrder(orderId: string) {
  return useQuery({
    queryKey: shopKeys.order(orderId),
    queryFn: () => shopEndpoints.order(orderId),
    // Staff move it along; check again now and then while it is open.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && ['DELIVERED', 'CANCELLED', 'EXPIRED', 'RETURNED'].includes(status) ? false : 60_000;
    },
  });
}

export function useOrderActions(orderId: string) {
  const client = useQueryClient();
  const store = (order: OrderResponse) => {
    client.setQueryData(shopKeys.order(order.id), order);
    void client.invalidateQueries({ queryKey: shopKeys.orders });
  };
  return {
    cancel: useMutation({
      mutationFn: (reason: string) => shopEndpoints.cancelOrder(orderId, reason),
      onSuccess: store,
    }),
    attachPhoto: useMutation({
      mutationFn: (file: UploadFile) => shopEndpoints.attachPrescriptionPhoto(orderId, file),
      onSuccess: store,
    }),
    linkPrescription: useMutation({
      mutationFn: (prescriptionId: string) => shopEndpoints.linkPrescription(orderId, prescriptionId),
      onSuccess: store,
    }),
  };
}
