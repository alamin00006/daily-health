import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import {
  appointmentsEndpoints,
  doctorsEndpoints,
  type ProviderSearchFilters,
} from '@/api/doctors-endpoints';
import { queryKeys } from '@/api/query-keys';
import type {
  AppointmentResponse,
  BookAppointmentRequest,
  CreateFollowUpRequest,
  ReviewAppointmentRequest,
  UpdateFollowUpRequest,
} from '@/shared-contracts/appointments.contract';
import type { ConsultationMode, ProviderType } from '@/shared-contracts/doctors.contract';

/** Text the user is still typing: searched 350 ms after they stop. */
export function useDebouncedValue<T>(value: T, ms = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

export function useSpecialties(type: ProviderType) {
  return useQuery({
    queryKey: queryKeys.specialties(type),
    queryFn: () => doctorsEndpoints.specialties(type),
    staleTime: 60 * 60_000,
  });
}

export function useProviderSearch(filters: ProviderSearchFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.providerSearch({ ...filters }),
    queryFn: ({ pageParam }) => doctorsEndpoints.search(filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.cursor ?? undefined) : undefined),
    staleTime: 60_000,
  });
}

export function useProvider(providerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.provider(providerId ?? ''),
    queryFn: () => doctorsEndpoints.detail(providerId!),
    enabled: Boolean(providerId),
  });
}

export function useProviderReviews(providerId: string | undefined) {
  return useInfiniteQuery({
    queryKey: queryKeys.reviews(providerId ?? ''),
    queryFn: ({ pageParam }) => doctorsEndpoints.reviews(providerId!, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.cursor ?? undefined) : undefined),
    enabled: Boolean(providerId),
  });
}

/** Two weeks of bookable sessions; refreshed often because others book too. */
export function useAvailability(
  providerId: string | undefined,
  mode: ConsultationMode | null,
  from?: string
) {
  return useQuery({
    queryKey: queryKeys.availability(providerId ?? '', mode ?? '', from ?? 'today'),
    queryFn: () => doctorsEndpoints.availability(providerId!, mode!, from),
    enabled: Boolean(providerId && mode),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

export function useFavorites(profileId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.favorites(profileId ?? ''),
    queryFn: () => doctorsEndpoints.favorites(profileId!),
    enabled: Boolean(profileId),
  });
}

export function useToggleFavorite(profileId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ providerId, favorite }: { providerId: string; favorite: boolean }) =>
      favorite
        ? doctorsEndpoints.addFavorite(profileId, providerId)
        : doctorsEndpoints.removeFavorite(profileId, providerId),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.favorites(profileId) }),
  });
}

// --- Appointments -------------------------------------------------------------

export function useAppointments(profileId: string | undefined, scope: 'upcoming' | 'past') {
  return useInfiniteQuery({
    queryKey: queryKeys.appointments(profileId ?? '', scope),
    queryFn: ({ pageParam }) => appointmentsEndpoints.list(profileId!, scope, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.cursor ?? undefined) : undefined),
    enabled: Boolean(profileId),
  });
}

/** The soonest upcoming booking, for the home screen. */
export function useNextAppointment(profileId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.appointments(profileId ?? '', 'upcoming'), 'next'],
    queryFn: async () =>
      (await appointmentsEndpoints.list(profileId!, 'upcoming')).data[0] ?? null,
    enabled: Boolean(profileId),
    staleTime: 60_000,
  });
}

export function useAppointment(profileId: string | undefined, appointmentId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.appointment(profileId ?? '', appointmentId ?? ''),
    queryFn: () => appointmentsEndpoints.get(profileId!, appointmentId!),
    enabled: Boolean(profileId && appointmentId),
    // A held booking turns EXPIRED after 10 minutes; keep the screen honest.
    refetchInterval: (query) =>
      query.state.data?.status === 'PENDING_PAYMENT' ? 20_000 : false,
  });
}

/** After any booking change: lists, the detail and the doctor's free slots. */
function useAppointmentCache(profileId: string) {
  const client = useQueryClient();
  return (appointment: AppointmentResponse) => {
    client.setQueryData(queryKeys.appointment(profileId, appointment.id), appointment);
    void client.invalidateQueries({ queryKey: ['profile', profileId, 'appointments'] });
    void client.invalidateQueries({
      queryKey: ['providers', appointment.provider.id, 'availability'],
    });
  };
}

export function useBookAppointment(profileId: string) {
  const update = useAppointmentCache(profileId);
  return useMutation({
    mutationFn: (body: BookAppointmentRequest) => appointmentsEndpoints.book(profileId, body),
    onSuccess: update,
  });
}

export function useAppointmentActions(profileId: string, appointmentId: string) {
  const update = useAppointmentCache(profileId);
  const client = useQueryClient();
  return {
    cancel: useMutation({
      mutationFn: (reason?: string) =>
        appointmentsEndpoints.cancel(profileId, appointmentId, reason),
      onSuccess: update,
    }),
    review: useMutation({
      mutationFn: (body: ReviewAppointmentRequest) =>
        appointmentsEndpoints.review(profileId, appointmentId, body),
      onSuccess: (appointment) => {
        update(appointment);
        void client.invalidateQueries({ queryKey: ['providers', appointment.provider.id] });
      },
    }),
  };
}

export function useFollowUps(profileId: string | undefined, scope: 'upcoming' | 'past') {
  return useQuery({
    queryKey: queryKeys.followUps(profileId ?? '', scope),
    queryFn: async () => (await appointmentsEndpoints.followUps(profileId!, scope)).data,
    enabled: Boolean(profileId),
  });
}

export function useFollowUpActions(profileId: string) {
  const client = useQueryClient();
  const refresh = () =>
    client.invalidateQueries({ queryKey: ['profile', profileId, 'follow-ups'] });
  return {
    create: useMutation({
      mutationFn: (body: CreateFollowUpRequest) =>
        appointmentsEndpoints.createFollowUp(profileId, body),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, ...body }: UpdateFollowUpRequest & { id: string }) =>
        appointmentsEndpoints.updateFollowUp(profileId, id, body),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => appointmentsEndpoints.deleteFollowUp(profileId, id),
      onSuccess: refresh,
    }),
  };
}
