import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/api/query-keys';
import { womensHealthEndpoints } from '@/api/womens-health-endpoints';
import type {
  CreatePeriodRequest,
  SaveDailyLogRequest,
  StartPregnancyRequest,
  UpdateCycleSettingsRequest,
  UpdatePeriodRequest,
} from '@/shared-contracts/womens-health.contract';

export function useCycleOverview(profileId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.cycleOverview(profileId ?? ''),
    queryFn: () => womensHealthEndpoints.overview(profileId!),
    enabled: Boolean(profileId) && enabled,
  });
}

export function usePeriods(profileId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.periods(profileId ?? ''),
    queryFn: () => womensHealthEndpoints.periods(profileId!),
    enabled: Boolean(profileId),
  });
}

export function useCycleLogs(profileId: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: queryKeys.cycleLogs(profileId ?? '', from, to),
    queryFn: () => womensHealthEndpoints.logs(profileId!, from, to),
    enabled: Boolean(profileId),
  });
}

/** Every change can move the predictions, so the whole section is refetched. */
function useInvalidateSection(profileId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.womensHealth(profileId) });
}

export function useWomensHealthActions(profileId: string) {
  const invalidate = useInvalidateSection(profileId);
  return {
    updateSettings: useMutation({
      mutationFn: (body: UpdateCycleSettingsRequest) => womensHealthEndpoints.updateSettings(profileId, body),
      onSuccess: invalidate,
    }),
    createPeriod: useMutation({
      mutationFn: (body: CreatePeriodRequest) => womensHealthEndpoints.createPeriod(profileId, body),
      onSuccess: invalidate,
    }),
    updatePeriod: useMutation({
      mutationFn: ({ periodId, body }: { periodId: string; body: UpdatePeriodRequest }) =>
        womensHealthEndpoints.updatePeriod(profileId, periodId, body),
      onSuccess: invalidate,
    }),
    removePeriod: useMutation({
      mutationFn: (periodId: string) => womensHealthEndpoints.removePeriod(profileId, periodId),
      onSuccess: invalidate,
    }),
    saveLog: useMutation({
      mutationFn: ({ date, body }: { date: string; body: SaveDailyLogRequest }) =>
        womensHealthEndpoints.saveLog(profileId, date, body),
      onSuccess: invalidate,
    }),
    startPregnancy: useMutation({
      mutationFn: (body: StartPregnancyRequest) => womensHealthEndpoints.startPregnancy(profileId, body),
      onSuccess: invalidate,
    }),
    endPregnancy: useMutation({
      mutationFn: () => womensHealthEndpoints.endPregnancy(profileId),
      onSuccess: invalidate,
    }),
  };
}
