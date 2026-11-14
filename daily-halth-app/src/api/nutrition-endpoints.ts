import { apiRequest } from './http-client';
import { buildQuery } from './query-string';

import type { PaginatedResponse } from '@/shared-contracts/common-fields.contract';
import type {
  CreateDietPlanRequest,
  DietDayResponse,
  DietPlanCandidateResponse,
  DietPlanResponse,
  DietPlanStatus,
  ProviderDietPlanResponse,
  UpdateDietPlanRequest,
} from '@/shared-contracts/nutrition.contract';

const auth = { authenticated: true } as const;

/** Diet plans: the family's daily check-offs, and the provider area's writing. */
export const nutritionEndpoints = {
  plans: (profileId: string) => apiRequest<DietPlanResponse[]>(`/profiles/${profileId}/diet-plans`, auth),
  day: (profileId: string, date: string) => apiRequest<DietDayResponse>(`/profiles/${profileId}/diet/days/${date}`, auth),
  setMeal: (profileId: string, date: string, mealId: string, followed: boolean) =>
    apiRequest<DietDayResponse>(`/profiles/${profileId}/diet/days/${date}/meals/${mealId}`, {
      ...auth,
      method: 'PUT',
      body: { followed },
    }),
  setWater: (profileId: string, date: string, waterMl: number) =>
    apiRequest<DietDayResponse>(`/profiles/${profileId}/diet/days/${date}/water`, { ...auth, method: 'PUT', body: { waterMl } }),

  providerPlans: (status?: DietPlanStatus) =>
    apiRequest<PaginatedResponse<ProviderDietPlanResponse>>(`/provider/me/diet-plans${buildQuery({ status, limit: 50 })}`, auth),
  providerPlan: (planId: string) => apiRequest<ProviderDietPlanResponse>(`/provider/me/diet-plans/${planId}`, auth),
  candidates: () => apiRequest<DietPlanCandidateResponse[]>('/provider/me/diet-plans/candidates', auth),
  createPlan: (body: CreateDietPlanRequest) =>
    apiRequest<ProviderDietPlanResponse>('/provider/me/diet-plans', { ...auth, method: 'POST', body }),
  updatePlan: (planId: string, body: UpdateDietPlanRequest) =>
    apiRequest<ProviderDietPlanResponse>(`/provider/me/diet-plans/${planId}`, { ...auth, method: 'PUT', body }),
  planStep: (planId: string, step: 'publish' | 'end') =>
    apiRequest<ProviderDietPlanResponse>(`/provider/me/diet-plans/${planId}/${step}`, { ...auth, method: 'POST' }),
  removePlan: (planId: string) => apiRequest<void>(`/provider/me/diet-plans/${planId}`, { ...auth, method: 'DELETE' }),
};
