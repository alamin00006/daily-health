import { buildQuery } from './query-string';
import { apiRequest } from './http-client';

import type { PaginatedResponse } from '@/shared-contracts/common-fields.contract';
import type {
  AdherenceResponse,
  CreateMedicationPlanRequest,
  DayScheduleResponse,
  DoseSlotResponse,
  MedicationPlanResponse,
  MedicineResponse,
  RecordDoseRequest,
  UpdateMedicationPlanRequest,
} from '@/shared-contracts/medicine.contract';

const auth = { authenticated: true } as const;

/** Medicine catalog, plans, the day's doses and adherence. */
export const medicineEndpoints = {
  search: (q: string) =>
    apiRequest<MedicineResponse[]>(`/medicines${buildQuery({ q, limit: 15 })}`, auth),

  plans: (profileId: string, includeStopped = false) =>
    apiRequest<PaginatedResponse<MedicationPlanResponse>>(
      `/profiles/${profileId}/medication-plans${buildQuery({ includeStopped: String(includeStopped) })}`,
      auth
    ),
  plan: (profileId: string, planId: string) =>
    apiRequest<MedicationPlanResponse>(`/profiles/${profileId}/medication-plans/${planId}`, auth),
  createPlan: (profileId: string, body: CreateMedicationPlanRequest) =>
    apiRequest<MedicationPlanResponse>(`/profiles/${profileId}/medication-plans`, {
      ...auth,
      method: 'POST',
      body,
    }),
  updatePlan: (profileId: string, planId: string, body: UpdateMedicationPlanRequest) =>
    apiRequest<MedicationPlanResponse>(`/profiles/${profileId}/medication-plans/${planId}`, {
      ...auth,
      method: 'PATCH',
      body,
    }),
  restock: (profileId: string, planId: string, quantity: number) =>
    apiRequest<MedicationPlanResponse>(
      `/profiles/${profileId}/medication-plans/${planId}/restock`,
      { ...auth, method: 'POST', body: { quantity } }
    ),
  stopPlan: (profileId: string, planId: string) =>
    apiRequest<MedicationPlanResponse>(`/profiles/${profileId}/medication-plans/${planId}/stop`, {
      ...auth,
      method: 'POST',
    }),
  deletePlan: (profileId: string, planId: string) =>
    apiRequest<void>(`/profiles/${profileId}/medication-plans/${planId}`, {
      ...auth,
      method: 'DELETE',
    }),

  day: (profileId: string, date?: string) =>
    apiRequest<DayScheduleResponse>(`/profiles/${profileId}/doses${buildQuery({ date })}`, auth),
  recordDose: (profileId: string, body: RecordDoseRequest) =>
    apiRequest<DoseSlotResponse>(`/profiles/${profileId}/doses`, {
      ...auth,
      method: 'POST',
      body,
    }),
  adherence: (profileId: string, days: number) =>
    apiRequest<AdherenceResponse>(
      `/profiles/${profileId}/medicine/adherence${buildQuery({ days })}`,
      auth
    ),
};
