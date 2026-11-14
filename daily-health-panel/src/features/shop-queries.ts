"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { PaginatedResponse } from "@/shared-contracts/common-fields.contract";
import type {
  AdjustStockRequest,
  CreateBrandRequest,
  CreateDeliveryZoneRequest,
  CreateDiscountPartnerRequest,
  CreateProductCategoryRequest,
  CreateProductRequest,
  CreateShopBannerRequest,
  OrderStatus,
  OrderSummaryResponse,
  ReturnOrderRequest,
  ReviewOrderPrescriptionRequest,
  ShopSettingsChangeResponse,
  ShopSettingsResponse,
  ShopStaffCountsResponse,
  StaffBrandResponse,
  StaffDeliveryZoneResponse,
  StaffDiscountPartnerResponse,
  StaffOrderResponse,
  StaffProductCategoryResponse,
  StaffProductResponse,
  StaffShopBannerResponse,
  StockMovementResponse,
  UpdateShopSettingsRequest,
} from "@/shared-contracts/shop.contract";

export type StaffOrderSummary = OrderSummaryResponse & { recipientName: string; zoneName: string };

export const shopKeys = {
  all: ["staff", "shop"] as const,
  settings: ["staff", "shop", "settings"] as const,
  history: ["staff", "shop", "settings", "history"] as const,
  counts: ["staff", "shop", "counts"] as const,
  orders: (filters: Record<string, string>) => ["staff", "shop", "orders", filters] as const,
  order: (id: string) => ["staff", "shop", "order", id] as const,
  products: (filters: Record<string, string>) => ["staff", "shop", "products", filters] as const,
  movements: (id: string) => ["staff", "shop", "movements", id] as const,
  list: (kind: SetupKind) => ["staff", "shop", "setup", kind] as const,
};

const nextCursor = <T,>(last: PaginatedResponse<T>) => (last.meta.hasMore ? (last.meta.cursor ?? undefined) : undefined);

// --- Settings and counts ----------------------------------------------------------

export function useShopSettings() {
  return useQuery({ queryKey: shopKeys.settings, queryFn: () => api.get<ShopSettingsResponse>("/staff/shop/settings") });
}

export function useShopSettingsHistory(enabled: boolean) {
  return useQuery({
    queryKey: shopKeys.history,
    enabled,
    queryFn: () => api.get<PaginatedResponse<ShopSettingsChangeResponse>>("/staff/shop/settings/history", { limit: 20 }),
  });
}

export function useUpdateShopSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateShopSettingsRequest) => api.patch<ShopSettingsResponse>("/staff/shop/settings", body),
    onSuccess: (data) => {
      client.setQueryData(shopKeys.settings, data);
      void client.invalidateQueries({ queryKey: shopKeys.history });
    },
  });
}

export function useShopCounts(enabled = true) {
  return useQuery({
    queryKey: shopKeys.counts,
    enabled,
    queryFn: () => api.get<ShopStaffCountsResponse>("/staff/shop/counts"),
    refetchInterval: 60_000,
  });
}

// --- Orders ---------------------------------------------------------------------

export function useStaffOrders(filters: { status?: OrderStatus; prescription?: "PENDING_REVIEW"; q?: string }) {
  const params: Record<string, string> = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => Boolean(v)) as [string, string][],
  );
  return useInfiniteQuery({
    queryKey: shopKeys.orders(params),
    queryFn: ({ pageParam }) =>
      api.get<PaginatedResponse<StaffOrderSummary>>("/staff/shop/orders", { ...params, cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    refetchInterval: 60_000,
  });
}

export function useStaffOrder(id: string | null) {
  return useQuery({
    queryKey: shopKeys.order(id ?? ""),
    enabled: Boolean(id),
    queryFn: () => api.get<StaffOrderResponse>(`/staff/shop/orders/${id}`),
  });
}

export function useOrderActions() {
  const client = useQueryClient();
  const done = (order: StaffOrderResponse) => {
    client.setQueryData(shopKeys.order(order.id), order);
    void client.invalidateQueries({ queryKey: ["staff", "shop", "orders"] });
    void client.invalidateQueries({ queryKey: shopKeys.counts });
    void client.invalidateQueries({ queryKey: ["staff", "shop", "products"] });
  };
  return {
    review: useMutation({
      mutationFn: ({ id, body }: { id: string; body: ReviewOrderPrescriptionRequest }) =>
        api.post<StaffOrderResponse>(`/staff/shop/orders/${id}/prescription-review`, body),
      onSuccess: done,
    }),
    step: useMutation({
      mutationFn: ({ id, step, note }: { id: string; step: "confirm" | "dispatch" | "deliver"; note?: string }) =>
        api.post<StaffOrderResponse>(`/staff/shop/orders/${id}/${step}`, { note: note || null }),
      onSuccess: done,
    }),
    cancel: useMutation({
      mutationFn: ({ id, reason }: { id: string; reason: string }) =>
        api.post<StaffOrderResponse>(`/staff/shop/orders/${id}/cancel`, { reason }),
      onSuccess: done,
    }),
    markReturned: useMutation({
      mutationFn: ({ id, body }: { id: string; body: ReturnOrderRequest }) =>
        api.post<StaffOrderResponse>(`/staff/shop/orders/${id}/return`, body),
      onSuccess: done,
    }),
  };
}

// --- Products and stock -----------------------------------------------------------

export function useStaffProducts(filters: { q?: string; categoryId?: string; stock?: "LOW" | "OUT" }) {
  const params: Record<string, string> = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => Boolean(v)) as [string, string][],
  );
  return useInfiniteQuery({
    queryKey: shopKeys.products(params),
    queryFn: ({ pageParam }) =>
      api.get<PaginatedResponse<StaffProductResponse>>("/staff/shop/products", { ...params, cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
  });
}

export function useStockMovements(productId: string | null) {
  return useQuery({
    queryKey: shopKeys.movements(productId ?? ""),
    enabled: Boolean(productId),
    queryFn: () =>
      api.get<PaginatedResponse<StockMovementResponse>>(`/staff/shop/products/${productId}/stock-movements`, { limit: 30 }),
  });
}

export function useProductActions() {
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["staff", "shop", "products"] });
    void client.invalidateQueries({ queryKey: shopKeys.counts });
  };
  return {
    create: useMutation({
      mutationFn: (body: CreateProductRequest) => api.post<StaffProductResponse>("/staff/shop/products", body),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: Partial<CreateProductRequest> }) =>
        api.patch<StaffProductResponse>(`/staff/shop/products/${id}`, body),
      onSuccess: refresh,
    }),
    setImage: useMutation({
      mutationFn: ({ id, file }: { id: string; file: File }) =>
        api.upload<StaffProductResponse>(`/staff/shop/products/${id}/image`, file, {}, "PUT"),
      onSuccess: refresh,
    }),
    adjustStock: useMutation({
      mutationFn: ({ id, body }: { id: string; body: AdjustStockRequest }) =>
        api.post<StaffProductResponse>(`/staff/shop/products/${id}/stock`, body),
      onSuccess: (product) => {
        refresh();
        void client.invalidateQueries({ queryKey: shopKeys.movements(product.id) });
      },
    }),
  };
}

// --- Setup lists: categories, brands, zones, banners, partners ----------------------

export type SetupKind = "categories" | "brands" | "delivery-zones" | "banners" | "partners";

export interface SetupRow {
  categories: StaffProductCategoryResponse;
  brands: StaffBrandResponse;
  "delivery-zones": StaffDeliveryZoneResponse;
  banners: StaffShopBannerResponse;
  partners: StaffDiscountPartnerResponse;
}
export interface SetupBody {
  categories: CreateProductCategoryRequest;
  brands: CreateBrandRequest;
  "delivery-zones": CreateDeliveryZoneRequest;
  banners: CreateShopBannerRequest;
  partners: CreateDiscountPartnerRequest;
}

/** The picture endpoint of each kind (zones have none). */
export const SETUP_IMAGE_PATH: Partial<Record<SetupKind, string>> = {
  categories: "image",
  brands: "logo",
  banners: "image",
  partners: "logo",
};

export function useSetupList<K extends SetupKind>(kind: K) {
  return useQuery({ queryKey: shopKeys.list(kind), queryFn: () => api.get<SetupRow[K][]>(`/staff/shop/${kind}`) });
}

export function useSetupActions<K extends SetupKind>(kind: K) {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: shopKeys.list(kind) });
  return {
    create: useMutation({
      mutationFn: (body: SetupBody[K]) => api.post<SetupRow[K]>(`/staff/shop/${kind}`, body),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: Partial<SetupBody[K]> }) =>
        api.patch<SetupRow[K]>(`/staff/shop/${kind}/${id}`, body),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete(`/staff/shop/${kind}/${id}`),
      onSuccess: refresh,
    }),
    setImage: useMutation({
      mutationFn: ({ id, file }: { id: string; file: File }) =>
        api.upload(`/staff/shop/${kind}/${id}/${SETUP_IMAGE_PATH[kind]}`, file, {}, "PUT"),
      onSuccess: refresh,
    }),
  };
}
