import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { emergencyEndpoints } from '@/api/emergency-endpoints';
import { queryKeys } from '@/api/query-keys';
import type {
  CreateEmergencyContactRequest,
  CreateEmergencyRequest,
  UpdateEmergencyContactRequest,
} from '@/shared-contracts/emergency.contract';

export function useEmergencyContacts(profileId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.emergencyContacts(profileId ?? ''),
    queryFn: () => emergencyEndpoints.contacts(profileId!),
    enabled: Boolean(profileId),
  });
}

/** The open request; polled while one is live so staff updates show without a socket. */
export function useActiveEmergency(profileId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.emergencyActive(profileId ?? ''),
    queryFn: () => emergencyEndpoints.active(profileId!),
    enabled: Boolean(profileId),
    refetchInterval: (query) => (query.state.data ? 20_000 : false),
  });
}

export function useEmergencyHistory(profileId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.emergencyHistory(profileId ?? ''),
    queryFn: () => emergencyEndpoints.history(profileId!),
    enabled: Boolean(profileId),
  });
}

export function useEmergencyActions(profileId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['profile', profileId, 'emergency'] });
  return {
    raise: useMutation({
      mutationFn: (body: CreateEmergencyRequest) => emergencyEndpoints.raise(profileId, body),
      onSuccess: invalidate,
    }),
    addLocation: useMutation({
      mutationFn: ({ requestId, lat, lng }: { requestId: string; lat: number; lng: number }) =>
        emergencyEndpoints.addLocation(profileId, requestId, { lat, lng }),
      onSuccess: invalidate,
    }),
    cancel: useMutation({
      mutationFn: (requestId: string) => emergencyEndpoints.cancel(profileId, requestId),
      onSuccess: invalidate,
    }),
    addContact: useMutation({
      mutationFn: (body: CreateEmergencyContactRequest) => emergencyEndpoints.addContact(profileId, body),
      onSuccess: invalidate,
    }),
    updateContact: useMutation({
      mutationFn: ({ contactId, body }: { contactId: string; body: UpdateEmergencyContactRequest }) =>
        emergencyEndpoints.updateContact(profileId, contactId, body),
      onSuccess: invalidate,
    }),
    removeContact: useMutation({
      mutationFn: (contactId: string) => emergencyEndpoints.removeContact(profileId, contactId),
      onSuccess: invalidate,
    }),
  };
}
