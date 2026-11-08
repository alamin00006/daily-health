import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { healthEndpoints } from '@/api/health-endpoints';
import { queryKeys } from '@/api/query-keys';
import type {
  CreateConditionRequest,
  CreateVitalRequest,
  UpdateConditionRequest,
  VitalType,
} from '@/shared-contracts/health.contract';

export function useLatestVitals(profileId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.latestVitals(profileId ?? ''),
    queryFn: async () => (await healthEndpoints.latestVitals(profileId!)).data,
    enabled: Boolean(profileId),
  });
}

/** Newest first, 30 per page; for the list and the trend chart. */
export function useVitals(profileId: string | undefined, type: VitalType) {
  return useInfiniteQuery({
    queryKey: queryKeys.vitals(profileId ?? '', type),
    queryFn: ({ pageParam }) =>
      healthEndpoints.vitals(profileId!, { type, cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => (page.meta.hasMore ? (page.meta.cursor ?? undefined) : undefined),
    enabled: Boolean(profileId),
  });
}

function useInvalidateVitals(profileId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['profile', profileId, 'vitals'] });
}

export function useAddVital(profileId: string) {
  const invalidate = useInvalidateVitals(profileId);
  return useMutation({
    mutationFn: (body: CreateVitalRequest) => healthEndpoints.addVital(profileId, body),
    onSuccess: invalidate,
  });
}

export function useRemoveVital(profileId: string) {
  const invalidate = useInvalidateVitals(profileId);
  return useMutation({
    mutationFn: (readingId: string) => healthEndpoints.removeVital(profileId, readingId),
    onSuccess: invalidate,
  });
}

export function useConditions(profileId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.conditions(profileId ?? ''),
    queryFn: async () => (await healthEndpoints.conditions(profileId!)).data,
    enabled: Boolean(profileId),
  });
}

export function useSaveCondition(profileId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      conditionId,
      body,
    }: {
      conditionId?: string;
      body: CreateConditionRequest | UpdateConditionRequest;
    }) =>
      conditionId
        ? healthEndpoints.updateCondition(profileId, conditionId, body)
        : healthEndpoints.addCondition(profileId, body as CreateConditionRequest),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.conditions(profileId) }),
  });
}

export function useRemoveCondition(profileId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conditionId: string) => healthEndpoints.removeCondition(profileId, conditionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.conditions(profileId) }),
  });
}

export function useHealthCard(profileId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.healthCard(profileId ?? ''),
    queryFn: async () => (await healthEndpoints.healthCard(profileId!)).card,
    enabled: Boolean(profileId),
  });
}

export function useHealthCardActions(profileId: string) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.healthCard(profileId) });
  const issue = useMutation({
    mutationFn: () => healthEndpoints.issueHealthCard(profileId),
    onSuccess: refresh,
  });
  const revoke = useMutation({
    mutationFn: () => healthEndpoints.revokeHealthCard(profileId),
    onSuccess: refresh,
  });
  return { issue, revoke };
}

export function useHealthCardAccesses(profileId: string | undefined, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: queryKeys.healthCardAccesses(profileId ?? ''),
    queryFn: ({ pageParam }) => healthEndpoints.healthCardAccesses(profileId!, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => (page.meta.hasMore ? (page.meta.cursor ?? undefined) : undefined),
    enabled: Boolean(profileId) && enabled,
  });
}
