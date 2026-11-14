"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, isApiError } from "@/lib/api-client";
import type {
  CompleteAppointmentRequest,
  ProviderAppointmentResponse,
  ProviderCalendarDayResponse,
} from "@/shared-contracts/appointments.contract";
import type { PaginatedResponse } from "@/shared-contracts/common-fields.contract";
import type {
  CreateChamberRequest,
  CreateHospitalRequest,
  CreateScheduleExceptionRequest,
  CreateScheduleRequest,
  HospitalResponse,
  MyProviderProfileResponse,
  ProviderForReviewResponse,
  ProviderType,
  RegisterProviderRequest,
  ScheduleExceptionResponse,
  SpecialtyResponse,
  UpdateChamberRequest,
  UpdateProviderRequest,
  UpdateScheduleRequest,
  VerificationDocType,
  VerificationStatus,
} from "@/shared-contracts/doctors.contract";
import type { MeResponse } from "@/shared-contracts/profiles.contract";

export const keys = {
  me: ["me"] as const,
  provider: ["provider", "me"] as const,
  specialties: (type: ProviderType) => ["specialties", type] as const,
  hospitals: (q: string) => ["hospitals", q] as const,
  day: (date: string) => ["provider", "appointments", "day", date] as const,
  calendar: (from: string, days: number) => ["provider", "appointments", "calendar", from, days] as const,
  appointments: ["provider", "appointments"] as const,
  exceptions: ["provider", "exceptions"] as const,
  review: (status: VerificationStatus) => ["admin", "providers", status] as const,
  reviewOne: (id: string) => ["admin", "provider", id] as const,
  inbox: ["notifications"] as const,
};

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: () => api.get<MeResponse>("/me"), staleTime: 5 * 60_000 });
}

/** null = logged in but not registered as a provider yet. */
export function useMyProvider(enabled = true) {
  return useQuery({
    queryKey: keys.provider,
    enabled,
    queryFn: async () => {
      try {
        return await api.get<MyProviderProfileResponse>("/provider/me");
      } catch (error) {
        if (isApiError(error) && error.code === "PROVIDER_PROFILE_NOT_FOUND") return null;
        throw error;
      }
    },
  });
}

export function useSpecialties(type: ProviderType) {
  return useQuery({
    queryKey: keys.specialties(type),
    queryFn: () => api.get<SpecialtyResponse[]>("/specialties", { type }),
    staleTime: 60 * 60_000,
  });
}

export function useHospitalSearch(q: string) {
  return useQuery({
    queryKey: keys.hospitals(q),
    queryFn: () => api.get<HospitalResponse[]>("/hospitals", { q }),
    enabled: q.trim().length >= 2,
    staleTime: 5 * 60_000,
  });
}

/** Mutations that return the full profile replace the cached one. */
function useProfileMutation<TInput>(fn: (input: TInput) => Promise<MyProviderProfileResponse>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (profile) => client.setQueryData(keys.provider, profile),
  });
}

export const useRegisterProvider = () =>
  useProfileMutation((input: RegisterProviderRequest) => api.post<MyProviderProfileResponse>("/provider/me", input));
export const useUpdateProvider = () =>
  useProfileMutation((input: UpdateProviderRequest) => api.patch<MyProviderProfileResponse>("/provider/me", input));
export const useSetOnline = () =>
  useProfileMutation((isOnline: boolean) => api.put<MyProviderProfileResponse>("/provider/me/online", { isOnline }));
export const useUploadAvatar = () =>
  useProfileMutation((file: File) => api.upload<MyProviderProfileResponse>("/provider/me/avatar", file, {}, "PUT"));
export const useUploadDocument = () =>
  useProfileMutation(({ file, docType }: { file: File; docType: VerificationDocType }) =>
    api.upload<MyProviderProfileResponse>("/provider/me/documents", file, { docType }),
  );
export const useResubmit = () =>
  useProfileMutation(() => api.post<MyProviderProfileResponse>("/provider/me/resubmit"));
export const useCreateChamber = () =>
  useProfileMutation((input: CreateChamberRequest) => api.post<MyProviderProfileResponse>("/provider/me/chambers", input));
export const useUpdateChamber = () =>
  useProfileMutation(({ id, ...input }: UpdateChamberRequest & { id: string }) =>
    api.patch<MyProviderProfileResponse>(`/provider/me/chambers/${id}`, input),
  );
export const useCreateSchedules = () =>
  useProfileMutation((input: CreateScheduleRequest) => api.post<MyProviderProfileResponse>("/provider/me/schedules", input));
export const useUpdateSchedule = () =>
  useProfileMutation(({ id, ...input }: UpdateScheduleRequest & { id: string }) =>
    api.patch<MyProviderProfileResponse>(`/provider/me/schedules/${id}`, input),
  );

export function useRemoveAvatar() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete("/provider/me/avatar"),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.provider }),
  });
}

export function useRemoveDocument() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/provider/me/documents/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.provider }),
  });
}

export function useCreateHospital() {
  return useMutation({
    mutationFn: (input: CreateHospitalRequest) => api.post<HospitalResponse>("/hospitals", input),
  });
}

export function useExceptions() {
  return useQuery({
    queryKey: keys.exceptions,
    queryFn: () => api.get<ScheduleExceptionResponse[]>("/provider/me/schedule-exceptions"),
  });
}

export function useCreateException() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateScheduleExceptionRequest) =>
      api.post<ScheduleExceptionResponse>("/provider/me/schedule-exceptions", input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.exceptions });
      void client.invalidateQueries({ queryKey: keys.appointments });
    },
  });
}

export function useRemoveException() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/provider/me/schedule-exceptions/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.exceptions }),
  });
}

// --- Appointments ---------------------------------------------------------

export function useDay(date: string, enabled = true) {
  return useQuery({
    queryKey: keys.day(date),
    enabled,
    queryFn: () => api.get<ProviderAppointmentResponse[]>("/provider/me/appointments", { date }),
    // New bookings arrive while the chamber is running.
    refetchInterval: 60_000,
  });
}

export function useCalendar(from: string, days: number, enabled = true) {
  return useQuery({
    queryKey: keys.calendar(from, days),
    enabled,
    queryFn: () => api.get<ProviderCalendarDayResponse[]>("/provider/me/appointments/calendar", { from, days }),
    refetchInterval: 120_000,
  });
}

function useAppointmentMutation<TInput>(fn: (input: TInput) => Promise<ProviderAppointmentResponse>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => client.invalidateQueries({ queryKey: keys.appointments }),
  });
}

export const useCompleteAppointment = () =>
  useAppointmentMutation(({ id, ...input }: CompleteAppointmentRequest & { id: string }) =>
    api.post<ProviderAppointmentResponse>(`/provider/me/appointments/${id}/complete`, input),
  );
export const useNoShow = () =>
  useAppointmentMutation((id: string) => api.post<ProviderAppointmentResponse>(`/provider/me/appointments/${id}/no-show`));
export const useProviderCancel = () =>
  useAppointmentMutation(({ id, reason }: { id: string; reason: string }) =>
    api.post<ProviderAppointmentResponse>(`/provider/me/appointments/${id}/cancel`, { reason }),
  );

// --- Admin ------------------------------------------------------------------

export function useReviewQueue(status: VerificationStatus) {
  return useQuery({
    queryKey: keys.review(status),
    queryFn: () => api.get<PaginatedResponse<ProviderForReviewResponse>>("/admin/providers", { status, limit: 50 }),
  });
}

export function useReviewProvider(id: string) {
  return useQuery({
    queryKey: keys.reviewOne(id),
    queryFn: () => api.get<ProviderForReviewResponse>(`/admin/providers/${id}`),
  });
}

export function useVerifyDecision() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reject }: { id: string; reject?: string }) =>
      reject
        ? api.post<ProviderForReviewResponse>(`/admin/providers/${id}/reject`, { reason: reject })
        : api.post<ProviderForReviewResponse>(`/admin/providers/${id}/verify`),
    onSuccess: (provider) => {
      client.setQueryData(keys.reviewOne(provider.id), provider);
      void client.invalidateQueries({ queryKey: ["admin", "providers"] });
    },
  });
}
