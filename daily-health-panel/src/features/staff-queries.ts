"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  AddStaffRequest,
  AdminDashboardResponse,
  AdminUserResponse,
  AuditLogResponse,
  StaffMemberResponse,
  UpdateStaffRequest,
} from "@/shared-contracts/admin.contract";
import type { PaginatedResponse } from "@/shared-contracts/common-fields.contract";
import type {
  CreateHealthTipRequest,
  StaffHealthTipResponse,
  TipCategory,
  TipStatus,
  UpdateHealthTipRequest,
} from "@/shared-contracts/content.contract";
import type { HandleEmergencyRequest, StaffEmergencyRequestResponse } from "@/shared-contracts/emergency.contract";

export const staffKeys = {
  emergencies: (state: string) => ["staff", "emergencies", state] as const,
  tips: (status: string, category: string) => ["staff", "tips", status, category] as const,
  dashboard: ["admin", "dashboard"] as const,
  audit: (filters: Record<string, string>) => ["admin", "audit", filters] as const,
  users: (filters: Record<string, string>) => ["admin", "users", filters] as const,
  staff: ["admin", "staff"] as const,
};

const nextCursor = <T,>(last: PaginatedResponse<T>) => (last.meta.hasMore ? (last.meta.cursor ?? undefined) : undefined);

// --- Emergency (all staff) ------------------------------------------------------

export function useStaffEmergencies(state: "active" | "closed") {
  return useInfiniteQuery({
    queryKey: staffKeys.emergencies(state),
    queryFn: ({ pageParam }) =>
      api.get<PaginatedResponse<StaffEmergencyRequestResponse>>("/staff/emergency-requests", { state, cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    // The socket refreshes it at once; this is the fallback.
    refetchInterval: state === "active" ? 30_000 : false,
  });
}

/** Just the count, for the sidebar badge. */
export function useLiveEmergencyCount(enabled: boolean) {
  return useQuery({
    queryKey: [...staffKeys.emergencies("active"), "count"],
    enabled,
    queryFn: async () =>
      (await api.get<PaginatedResponse<StaffEmergencyRequestResponse>>("/staff/emergency-requests", { state: "active", limit: 50 })).data.length,
    refetchInterval: 30_000,
  });
}

export function useHandleEmergency() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: "dispatch" | "close"; body: HandleEmergencyRequest }) =>
      api.post<StaffEmergencyRequestResponse>(`/staff/emergency-requests/${id}/${action}`, body),
    onSuccess: () => client.invalidateQueries({ queryKey: ["staff", "emergencies"] }),
  });
}

// --- Health tips (all staff) ----------------------------------------------------

export function useStaffTips(status: TipStatus | "ALL", category: TipCategory | "ALL") {
  return useInfiniteQuery({
    queryKey: staffKeys.tips(status, category),
    queryFn: ({ pageParam }) =>
      api.get<PaginatedResponse<StaffHealthTipResponse>>("/staff/health-tips", {
        status: status === "ALL" ? undefined : status,
        category: category === "ALL" ? undefined : category,
        cursor: pageParam,
        limit: 20,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
  });
}

export function useTipActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ["staff", "tips"] });
  return {
    create: useMutation({
      mutationFn: (body: CreateHealthTipRequest) => api.post<StaffHealthTipResponse>("/staff/health-tips", body),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: UpdateHealthTipRequest }) =>
        api.patch<StaffHealthTipResponse>(`/staff/health-tips/${id}`, body),
      onSuccess: refresh,
    }),
    setPublished: useMutation({
      mutationFn: ({ id, published }: { id: string; published: boolean }) =>
        api.post<StaffHealthTipResponse>(`/staff/health-tips/${id}/${published ? "publish" : "unpublish"}`),
      onSuccess: refresh,
    }),
    setImage: useMutation({
      mutationFn: ({ id, file }: { id: string; file: File }) =>
        api.upload<StaffHealthTipResponse>(`/staff/health-tips/${id}/image`, file, {}, "PUT"),
      onSuccess: refresh,
    }),
    removeImage: useMutation({
      mutationFn: (id: string) => api.delete<StaffHealthTipResponse>(`/staff/health-tips/${id}/image`),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete(`/staff/health-tips/${id}`),
      onSuccess: refresh,
    }),
  };
}

// --- Admin only -----------------------------------------------------------------

export function useAdminDashboard() {
  return useQuery({ queryKey: staffKeys.dashboard, queryFn: () => api.get<AdminDashboardResponse>("/admin/dashboard"), refetchInterval: 60_000 });
}

export function useAuditLogs(filters: Record<string, string>) {
  return useInfiniteQuery({
    queryKey: staffKeys.audit(filters),
    queryFn: ({ pageParam }) => api.get<PaginatedResponse<AuditLogResponse>>("/admin/audit-logs", { ...filters, cursor: pageParam, limit: 50 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
  });
}

export function useAdminUsers(filters: Record<string, string>) {
  return useInfiniteQuery({
    queryKey: staffKeys.users(filters),
    queryFn: ({ pageParam }) => api.get<PaginatedResponse<AdminUserResponse>>("/admin/users", { ...filters, cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
  });
}

export function useSetSuspended() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, suspended }: { userId: string; suspended: boolean }) => api.patch(`/admin/users/${userId}`, { suspended }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin"] }),
  });
}

export function useStaffMembers() {
  return useQuery({ queryKey: staffKeys.staff, queryFn: () => api.get<StaffMemberResponse[]>("/admin/staff") });
}

export function useStaffActions() {
  const client = useQueryClient();
  const set = (rows: StaffMemberResponse[]) => {
    client.setQueryData(staffKeys.staff, rows);
    void client.invalidateQueries({ queryKey: ["admin", "users"] });
  };
  return {
    add: useMutation({ mutationFn: (body: AddStaffRequest) => api.post<StaffMemberResponse[]>("/admin/staff", body), onSuccess: set }),
    update: useMutation({
      mutationFn: ({ userId, body }: { userId: string; body: UpdateStaffRequest }) =>
        api.patch<StaffMemberResponse[]>(`/admin/staff/${userId}`, body),
      onSuccess: set,
    }),
    remove: useMutation({ mutationFn: (userId: string) => api.delete<StaffMemberResponse[]>(`/admin/staff/${userId}`), onSuccess: set }),
  };
}
