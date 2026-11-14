"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { PaginatedResponse } from "@/shared-contracts/common-fields.contract";
import type { MedicineResponse } from "@/shared-contracts/medicine.contract";
import type {
  PrescriptionResponse,
  PrescriptionStatus,
  SavePrescriptionDraftRequest,
  StartPrescriptionRequest,
} from "@/shared-contracts/prescription.contract";

const k = {
  list: (status: string) => ["prescriptions", status] as const,
  one: (id: string) => ["prescription", id] as const,
  medicines: (q: string) => ["medicines", q] as const,
};

export function usePrescriptions(status: PrescriptionStatus | "ALL") {
  return useInfiniteQuery({
    queryKey: k.list(status),
    queryFn: ({ pageParam }) =>
      api.get<PaginatedResponse<PrescriptionResponse>>("/provider/me/prescriptions", {
        status: status === "ALL" ? undefined : status,
        cursor: pageParam,
        limit: 20,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.cursor ?? undefined) : undefined),
  });
}

export function usePrescription(id: string) {
  return useQuery({ queryKey: k.one(id), queryFn: () => api.get<PrescriptionResponse>(`/provider/me/prescriptions/${id}`) });
}

/** Catalog search for the medicine field (2+ letters). */
export function useMedicineSearch(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: k.medicines(term),
    queryFn: () => api.get<MedicineResponse[]>("/medicines", { q: term, limit: 8 }),
    enabled: term.length >= 2,
    staleTime: 5 * 60_000,
  });
}

export function usePrescriptionActions() {
  const client = useQueryClient();
  const store = (row: PrescriptionResponse) => {
    client.setQueryData(k.one(row.id), row);
    void client.invalidateQueries({ queryKey: ["prescriptions"] });
  };
  return {
    start: useMutation({
      mutationFn: (body: StartPrescriptionRequest) => api.post<PrescriptionResponse>("/provider/me/prescriptions", body),
      onSuccess: store,
    }),
    save: useMutation({
      mutationFn: ({ id, body }: { id: string; body: SavePrescriptionDraftRequest }) =>
        api.put<PrescriptionResponse>(`/provider/me/prescriptions/${id}`, body),
      onSuccess: store,
    }),
    issue: useMutation({
      mutationFn: (id: string) => api.post<PrescriptionResponse>(`/provider/me/prescriptions/${id}/issue`),
      onSuccess: store,
    }),
    revoke: useMutation({
      mutationFn: ({ id, reason }: { id: string; reason: string }) =>
        api.post<PrescriptionResponse>(`/provider/me/prescriptions/${id}/revoke`, { reason }),
      onSuccess: store,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete(`/provider/me/prescriptions/${id}`),
      onSuccess: () => client.invalidateQueries({ queryKey: ["prescriptions"] }),
    }),
  };
}
