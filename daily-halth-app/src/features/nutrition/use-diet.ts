import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { nutritionEndpoints } from '@/api/nutrition-endpoints';
import type { PillTone } from '@/components/ui/status-pill';
import type {
  CreateDietPlanRequest,
  DietDayResponse,
  DietPlanStatus,
  MealType,
  UpdateDietPlanRequest,
} from '@/shared-contracts/nutrition.contract';

export const MEAL_LABEL: Record<MealType, string> = {
  BREAKFAST: 'সকালের নাস্তা',
  LUNCH: 'দুপুরের খাবার',
  SNACKS: 'বিকেলের নাস্তা',
  DINNER: 'রাতের খাবার',
};

export const DIET_STATUS_LABEL: Record<DietPlanStatus, string> = { DRAFT: 'খসড়া', ACTIVE: 'চালু', ENDED: 'শেষ' };

export const DIET_STATUS_TONE: Record<DietPlanStatus, PillTone> = { DRAFT: 'warning', ACTIVE: 'success', ENDED: 'neutral' };

const keys = {
  plans: (profileId: string) => ['profile', profileId, 'diet-plans'] as const,
  day: (profileId: string, date: string) => ['profile', profileId, 'diet-day', date] as const,
  provider: ['provider', 'diet-plans'] as const,
};

export function useDietPlans(profileId: string | undefined) {
  return useQuery({
    queryKey: keys.plans(profileId ?? ''),
    queryFn: () => nutritionEndpoints.plans(profileId!),
    enabled: Boolean(profileId),
  });
}

export function useDietDay(profileId: string | undefined, date: string) {
  return useQuery({
    queryKey: keys.day(profileId ?? '', date),
    queryFn: () => nutritionEndpoints.day(profileId!, date),
    enabled: Boolean(profileId),
  });
}

/** Ticks and water show at once (optimistic), then the server's day replaces them. */
export function useDietDayActions(profileId: string, date: string) {
  const client = useQueryClient();
  const key = keys.day(profileId, date);
  const optimistic = async (change: (day: DietDayResponse) => DietDayResponse) => {
    await client.cancelQueries({ queryKey: key });
    const before = client.getQueryData<DietDayResponse>(key);
    if (before) client.setQueryData(key, change(before));
    return { before };
  };
  const rollback = (_e: unknown, _v: unknown, ctx: { before?: DietDayResponse } | undefined) => {
    if (ctx?.before) client.setQueryData(key, ctx.before);
  };
  const store = (day: DietDayResponse) => client.setQueryData(key, day);
  return {
    setMeal: useMutation({
      mutationFn: ({ mealId, followed }: { mealId: string; followed: boolean }) =>
        nutritionEndpoints.setMeal(profileId, date, mealId, followed),
      onMutate: ({ mealId, followed }) =>
        optimistic((d) => ({ ...d, meals: d.meals.map((m) => (m.id === mealId ? { ...m, followed } : m)) })),
      onError: rollback,
      onSuccess: store,
    }),
    setWater: useMutation({
      mutationFn: (waterMl: number) => nutritionEndpoints.setWater(profileId, date, waterMl),
      onMutate: (waterMl) => optimistic((d) => ({ ...d, waterMl })),
      onError: rollback,
      onSuccess: store,
    }),
  };
}

// --- Provider area -----------------------------------------------------------------

export function useProviderDietPlans() {
  return useQuery({ queryKey: keys.provider, queryFn: () => nutritionEndpoints.providerPlans() });
}

export function useDietCandidates() {
  return useQuery({ queryKey: [...keys.provider, 'candidates'], queryFn: nutritionEndpoints.candidates });
}

export function useProviderDietPlan(planId: string | undefined) {
  return useQuery({
    queryKey: [...keys.provider, planId],
    queryFn: () => nutritionEndpoints.providerPlan(planId!),
    enabled: Boolean(planId),
  });
}

export function useProviderDietActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: keys.provider });
  return {
    create: useMutation({ mutationFn: (body: CreateDietPlanRequest) => nutritionEndpoints.createPlan(body), onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: UpdateDietPlanRequest }) => nutritionEndpoints.updatePlan(id, body),
      onSuccess: refresh,
    }),
    step: useMutation({
      mutationFn: ({ id, step }: { id: string; step: 'publish' | 'end' }) => nutritionEndpoints.planStep(id, step),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: (id: string) => nutritionEndpoints.removePlan(id), onSuccess: refresh }),
  };
}
