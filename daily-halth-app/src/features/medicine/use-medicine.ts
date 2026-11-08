import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { medicineEndpoints } from '@/api/medicine-endpoints';
import { queryKeys } from '@/api/query-keys';
import { dhakaDate } from '@/lib/bangla-format';
import type {
  CreateMedicationPlanRequest,
  DayScheduleResponse,
  DoseSlotResponse,
  DoseState,
  RecordDoseRequest,
  UpdateMedicationPlanRequest,
} from '@/shared-contracts/medicine.contract';

import { recordDoseOrQueue } from './offline-dose-queue';

/** Catalog search, 350 ms after the user stops typing; needs 2+ letters. */
export function useMedicineSearch(text: string) {
  const [query, setQuery] = useState(text.trim());
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 350);
    return () => clearTimeout(timer);
  }, [text]);
  return useQuery({
    queryKey: queryKeys.medicineSearch(query.toLowerCase()),
    queryFn: () => medicineEndpoints.search(query),
    enabled: query.length >= 2,
    staleTime: 10 * 60_000,
  });
}

export function usePlans(profileId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.plans(profileId ?? ''),
    queryFn: async () => (await medicineEndpoints.plans(profileId!, true)).data,
    enabled: Boolean(profileId),
  });
}

export function usePlan(profileId: string | undefined, planId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.plan(profileId ?? '', planId ?? ''),
    queryFn: () => medicineEndpoints.plan(profileId!, planId!),
    enabled: Boolean(profileId && planId),
  });
}

/** Everything that changes when a plan changes: plans, doses, adherence. */
function useInvalidateMedicine(profileId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.plans(profileId) }),
      queryClient.invalidateQueries({ queryKey: ['profile', profileId, 'plan'] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.doses(profileId) }),
      queryClient.invalidateQueries({ queryKey: ['profile', profileId, 'adherence'] }),
    ]);
}

export function useCreatePlan(profileId: string) {
  const invalidate = useInvalidateMedicine(profileId);
  return useMutation({
    mutationFn: (body: CreateMedicationPlanRequest) =>
      medicineEndpoints.createPlan(profileId, body),
    onSuccess: invalidate,
  });
}

export function useUpdatePlan(profileId: string, planId: string) {
  const invalidate = useInvalidateMedicine(profileId);
  return useMutation({
    mutationFn: (body: UpdateMedicationPlanRequest) =>
      medicineEndpoints.updatePlan(profileId, planId, body),
    onSuccess: invalidate,
  });
}

export function usePlanActions(profileId: string, planId: string) {
  const invalidate = useInvalidateMedicine(profileId);
  const restock = useMutation({
    mutationFn: (quantity: number) => medicineEndpoints.restock(profileId, planId, quantity),
    onSuccess: invalidate,
  });
  const stop = useMutation({
    mutationFn: () => medicineEndpoints.stopPlan(profileId, planId),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: () => medicineEndpoints.deletePlan(profileId, planId),
    onSuccess: invalidate,
  });
  return { restock, stop, remove };
}

export function useDaySchedule(profileId: string | undefined, date: string = dhakaDate()) {
  return useQuery({
    queryKey: queryKeys.doseDay(profileId ?? '', date),
    queryFn: () => medicineEndpoints.day(profileId!, date),
    enabled: Boolean(profileId),
    // States move from UPCOMING to DUE with the clock.
    refetchInterval: 5 * 60_000,
  });
}

export function useAdherence(profileId: string | undefined, days: number) {
  return useQuery({
    queryKey: queryKeys.adherence(profileId ?? '', days),
    queryFn: () => medicineEndpoints.adherence(profileId!, days),
    enabled: Boolean(profileId),
  });
}

const STATE_FOR_STATUS: Record<RecordDoseRequest['status'], DoseState | null> = {
  TAKEN: 'TAKEN',
  SKIPPED: 'SKIPPED',
  SNOOZED: 'SNOOZED',
  PENDING: null,
};

function applyToDay(
  day: DayScheduleResponse,
  body: RecordDoseRequest,
  patch: (dose: DoseSlotResponse) => DoseSlotResponse
): DayScheduleResponse {
  const doses = day.doses.map((dose) =>
    dose.planId === body.planId && dose.scheduledFor === body.scheduledFor ? patch(dose) : dose
  );
  const count = (state: DoseState) => doses.filter((dose) => dose.state === state).length;
  return {
    ...day,
    doses,
    summary: {
      total: doses.length,
      taken: count('TAKEN'),
      skipped: count('SKIPPED'),
      missed: count('MISSED'),
      remaining: count('UPCOMING') + count('DUE') + count('SNOOZED'),
    },
  };
}

/**
 * Taken / skipped / snoozed / undo. The list changes at once (optimistic);
 * without internet the choice is queued on the phone and sent later, so the
 * patient never sees an error for pressing "সেবন করেছি" offline.
 */
export function useRecordDose(profileId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RecordDoseRequest) => recordDoseOrQueue(profileId, body),
    onMutate: async (body) => {
      const date = dhakaDate(new Date(body.scheduledFor));
      const key = queryKeys.doseDay(profileId, date);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<DayScheduleResponse>(key);
      if (previous) {
        const now = new Date();
        queryClient.setQueryData<DayScheduleResponse>(key, (day) =>
          day
            ? applyToDay(day, body, (dose) => ({
                ...dose,
                status: body.status,
                state:
                  STATE_FOR_STATUS[body.status] ??
                  (Date.parse(dose.scheduledFor) > now.getTime() ? 'UPCOMING' : 'DUE'),
                actedAt: body.status === 'PENDING' ? null : now.toISOString(),
                snoozedUntil:
                  body.status === 'SNOOZED'
                    ? new Date(now.getTime() + (body.snoozeMinutes ?? 10) * 60_000).toISOString()
                    : null,
              }))
            : day
        );
      }
      return { key, previous };
    },
    onError: (_error, _body, context) => {
      if (context?.previous) queryClient.setQueryData(context.key, context.previous);
    },
    onSettled: (result) => {
      if (result?.queued) return; // keep the optimistic state until it is sent
      void queryClient.invalidateQueries({ queryKey: queryKeys.doses(profileId) });
      void queryClient.invalidateQueries({ queryKey: ['profile', profileId, 'adherence'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.plans(profileId) });
    },
  });
}
