import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { prescriptionsEndpoints } from '@/api/prescriptions-endpoints';
import { queryKeys } from '@/api/query-keys';
import type { PrescriptionResponse } from '@/shared-contracts/prescription.contract';

export function usePrescriptions(profileId: string | undefined) {
  return useInfiniteQuery({
    queryKey: queryKeys.prescriptions(profileId ?? ''),
    queryFn: ({ pageParam }) => prescriptionsEndpoints.list(profileId!, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.cursor ?? undefined) : undefined),
    enabled: Boolean(profileId),
  });
}

export function usePrescription(profileId: string | undefined, prescriptionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.prescription(profileId ?? '', prescriptionId ?? ''),
    queryFn: () => prescriptionsEndpoints.get(profileId!, prescriptionId!),
    enabled: Boolean(profileId && prescriptionId),
  });
}

/** One tap: a medicine alarm from a prescription line (refreshes the medicine screens too). */
export function useCreateAlarmFromItem(profileId: string, prescriptionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => prescriptionsEndpoints.createAlarm(profileId, prescriptionId, itemId),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.prescription(profileId, prescriptionId) }),
        client.invalidateQueries({ queryKey: queryKeys.prescriptions(profileId) }),
        client.invalidateQueries({ queryKey: queryKeys.plans(profileId) }),
        client.invalidateQueries({ queryKey: queryKeys.doses(profileId) }),
      ]),
  });
}

export function useLinkTestResult(profileId: string, prescriptionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ testId, fileId }: { testId: string; fileId: string | null }) =>
      prescriptionsEndpoints.linkTestResult(profileId, prescriptionId, testId, { fileId }),
    onSuccess: (row: PrescriptionResponse) =>
      client.setQueryData(queryKeys.prescription(profileId, prescriptionId), row),
  });
}
