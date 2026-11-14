import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { UploadFile } from '@/api/http-client';
import { myProviderEndpoints } from '@/api/my-provider-endpoints';
import { providerWorkEndpoints } from '@/api/provider-work-endpoints';
import type { CompleteAppointmentRequest } from '@/shared-contracts/appointments.contract';
import type { ConsultationResponse } from '@/shared-contracts/consultation.contract';
import type {
  MyProviderProfileResponse,
  ProviderType,
  RegisterProviderRequest,
  UpdateProviderRequest,
  VerificationDocType,
} from '@/shared-contracts/doctors.contract';
import type {
  PrescriptionResponse,
  SavePrescriptionDraftRequest,
  StartPrescriptionRequest,
} from '@/shared-contracts/prescription.contract';
import { useSessionStore } from '@/stores/session-store';

export const providerKeys = {
  me: ['provider', 'me'] as const,
  specialties: (type: ProviderType) => ['specialties', type] as const,
  day: (date: string) => ['provider', 'day', date] as const,
  appointment: (id: string) => ['provider', 'appointment', id] as const,
  consultations: (state: string) => ['consultations', 'provider', state] as const,
  queue: ['quick-queue'] as const,
  prescriptions: (status: string) => ['provider', 'prescriptions', status] as const,
  prescription: (id: string) => ['provider', 'prescription', id] as const,
};

// --- Own provider profile ------------------------------------------------------------------

/** The signed-in account's provider profile; null if it has not registered as one. */
export function useMyProvider() {
  const registered = useSessionStore((s) => s.status === 'signedIn' && !s.user?.isGuest);
  return useQuery({
    queryKey: providerKeys.me,
    queryFn: myProviderEndpoints.get,
    enabled: registered,
    staleTime: 60_000,
  });
}

function useStoreProfile() {
  const client = useQueryClient();
  return (row: MyProviderProfileResponse) => {
    client.setQueryData(providerKeys.me, row);
    void client.invalidateQueries({ queryKey: ['providers'] });
  };
}

export function useProviderProfileActions() {
  const client = useQueryClient();
  const store = useStoreProfile();
  const refetch = () => client.invalidateQueries({ queryKey: providerKeys.me });
  return {
    register: useMutation({
      mutationFn: (body: RegisterProviderRequest) => myProviderEndpoints.register(body),
      onSuccess: store,
    }),
    update: useMutation({
      mutationFn: (body: UpdateProviderRequest) => myProviderEndpoints.update(body),
      onSuccess: store,
    }),
    setAvatar: useMutation({ mutationFn: (file: UploadFile) => myProviderEndpoints.setAvatar(file), onSuccess: store }),
    removeAvatar: useMutation({ mutationFn: myProviderEndpoints.removeAvatar, onSuccess: refetch }),
    uploadDocument: useMutation({
      mutationFn: ({ file, docType }: { file: UploadFile; docType: VerificationDocType }) =>
        myProviderEndpoints.uploadDocument(file, docType),
      onSuccess: store,
    }),
    removeDocument: useMutation({ mutationFn: myProviderEndpoints.removeDocument, onSuccess: refetch }),
    resubmit: useMutation({ mutationFn: myProviderEndpoints.resubmit, onSuccess: store }),
    setOnline: useMutation({
      mutationFn: (isOnline: boolean) => myProviderEndpoints.setOnline(isOnline),
      onSuccess: (row) => {
        store(row);
        void client.invalidateQueries({ queryKey: providerKeys.queue });
      },
    }),
  };
}

export function useSpecialtiesFor(type: ProviderType) {
  return useQuery({
    queryKey: providerKeys.specialties(type),
    queryFn: () => providerWorkEndpoints.specialties(type),
    staleTime: 60 * 60_000,
  });
}

// --- Visits ------------------------------------------------------------------------------------

export function useProviderDay(date: string, enabled = true) {
  return useQuery({
    queryKey: providerKeys.day(date),
    queryFn: () => providerWorkEndpoints.day(date),
    enabled,
  });
}

export function useProviderAppointment(id: string | undefined) {
  return useQuery({
    queryKey: providerKeys.appointment(id ?? ''),
    queryFn: () => providerWorkEndpoints.appointment(id!),
    enabled: Boolean(id),
  });
}

export function useProviderAppointmentActions() {
  const client = useQueryClient();
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['provider', 'day'] }),
      client.invalidateQueries({ queryKey: ['provider', 'appointment'] }),
    ]);
  return {
    complete: useMutation({
      mutationFn: ({ id, body }: { id: string; body: CompleteAppointmentRequest }) =>
        providerWorkEndpoints.complete(id, body),
      onSuccess: refresh,
    }),
    noShow: useMutation({ mutationFn: providerWorkEndpoints.noShow, onSuccess: refresh }),
    cancel: useMutation({
      mutationFn: ({ id, reason }: { id: string; reason: string }) => providerWorkEndpoints.cancel(id, reason),
      onSuccess: refresh,
    }),
  };
}

// --- Consultations and the quick-consult queue -------------------------------------------------

export function useProviderConsultations(state: 'active' | 'past') {
  return useInfiniteQuery({
    queryKey: providerKeys.consultations(state),
    queryFn: ({ pageParam }) => providerWorkEndpoints.consultations(state, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.cursor ?? undefined) : undefined),
  });
}

export function useQuickQueue(enabled: boolean) {
  return useQuery({
    queryKey: providerKeys.queue,
    queryFn: providerWorkEndpoints.queue,
    enabled,
    // The socket refreshes it; this covers a dropped connection.
    refetchInterval: 30_000,
  });
}

function useStoreConsultation() {
  const client = useQueryClient();
  return (row: ConsultationResponse) => {
    client.setQueryData(['consultation', row.id], row);
    void client.invalidateQueries({ queryKey: ['consultations'] });
  };
}

export function useAcceptQuickConsult() {
  const client = useQueryClient();
  const store = useStoreConsultation();
  return useMutation({
    mutationFn: providerWorkEndpoints.accept,
    onSuccess: store,
    onSettled: () => client.invalidateQueries({ queryKey: providerKeys.queue }),
  });
}

export function useStartBookedConsult() {
  const store = useStoreConsultation();
  return useMutation({ mutationFn: providerWorkEndpoints.startBooked, onSuccess: store });
}

// --- Prescriptions ----------------------------------------------------------------------------

export function useProviderPrescriptions(status: string) {
  return useInfiniteQuery({
    queryKey: providerKeys.prescriptions(status),
    queryFn: ({ pageParam }) =>
      providerWorkEndpoints.prescriptions(status === 'ALL' ? undefined : status, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.cursor ?? undefined) : undefined),
  });
}

export function useProviderPrescription(id: string | undefined) {
  return useQuery({
    queryKey: providerKeys.prescription(id ?? ''),
    queryFn: () => providerWorkEndpoints.prescription(id!),
    enabled: Boolean(id),
  });
}

export function useMedicineCatalogSearch(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: ['medicines', term],
    queryFn: () => providerWorkEndpoints.searchMedicines(term),
    enabled: term.length >= 2,
    staleTime: 5 * 60_000,
  });
}

export function usePrescriptionWriting() {
  const client = useQueryClient();
  const store = (row: PrescriptionResponse) => {
    client.setQueryData(providerKeys.prescription(row.id), row);
    void client.invalidateQueries({ queryKey: ['provider', 'prescriptions'] });
  };
  return {
    start: useMutation({
      mutationFn: (body: StartPrescriptionRequest) => providerWorkEndpoints.startPrescription(body),
      onSuccess: store,
    }),
    save: useMutation({
      mutationFn: ({ id, body }: { id: string; body: SavePrescriptionDraftRequest }) =>
        providerWorkEndpoints.savePrescription(id, body),
      onSuccess: store,
    }),
    issue: useMutation({ mutationFn: providerWorkEndpoints.issuePrescription, onSuccess: store }),
    revoke: useMutation({
      mutationFn: ({ id, reason }: { id: string; reason: string }) =>
        providerWorkEndpoints.revokePrescription(id, reason),
      onSuccess: store,
    }),
    remove: useMutation({
      mutationFn: providerWorkEndpoints.deletePrescription,
      onSuccess: () => client.invalidateQueries({ queryKey: ['provider', 'prescriptions'] }),
    }),
  };
}
