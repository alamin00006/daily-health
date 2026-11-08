import { apiRequest } from './http-client';
import { buildQuery as query } from './query-string';

import type { PaginatedResponse } from '@/shared-contracts/common-fields.contract';
import type {
  ConditionKind,
  CreateConditionRequest,
  CreateVitalRequest,
  HealthCardAccessResponse,
  HealthCardResponse,
  HealthCardStatusResponse,
  LatestVitalsResponse,
  MedicalConditionResponse,
  UpdateConditionRequest,
  VitalReadingResponse,
  VitalType,
} from '@/shared-contracts/health.contract';

const auth = { authenticated: true } as const;

/** Vitals, conditions and the QR health card of one profile. */
export const healthEndpoints = {
  latestVitals: (profileId: string) =>
    apiRequest<LatestVitalsResponse>(`/profiles/${profileId}/vitals/latest`, auth),
  vitals: (
    profileId: string,
    params: { type?: VitalType; from?: string; cursor?: string; limit?: number }
  ) =>
    apiRequest<PaginatedResponse<VitalReadingResponse>>(
      `/profiles/${profileId}/vitals${query(params)}`,
      auth
    ),
  addVital: (profileId: string, body: CreateVitalRequest) =>
    apiRequest<VitalReadingResponse>(`/profiles/${profileId}/vitals`, {
      ...auth,
      method: 'POST',
      body,
    }),
  removeVital: (profileId: string, readingId: string) =>
    apiRequest<void>(`/profiles/${profileId}/vitals/${readingId}`, { ...auth, method: 'DELETE' }),

  conditions: (profileId: string, kind?: ConditionKind) =>
    apiRequest<PaginatedResponse<MedicalConditionResponse>>(
      `/profiles/${profileId}/conditions${query({ kind })}`,
      auth
    ),
  addCondition: (profileId: string, body: CreateConditionRequest) =>
    apiRequest<MedicalConditionResponse>(`/profiles/${profileId}/conditions`, {
      ...auth,
      method: 'POST',
      body,
    }),
  updateCondition: (profileId: string, conditionId: string, body: UpdateConditionRequest) =>
    apiRequest<MedicalConditionResponse>(`/profiles/${profileId}/conditions/${conditionId}`, {
      ...auth,
      method: 'PATCH',
      body,
    }),
  removeCondition: (profileId: string, conditionId: string) =>
    apiRequest<void>(`/profiles/${profileId}/conditions/${conditionId}`, {
      ...auth,
      method: 'DELETE',
    }),

  healthCard: (profileId: string) =>
    apiRequest<HealthCardStatusResponse>(`/profiles/${profileId}/health-card`, auth),
  issueHealthCard: (profileId: string) =>
    apiRequest<HealthCardResponse>(`/profiles/${profileId}/health-card`, {
      ...auth,
      method: 'POST',
      body: {},
    }),
  revokeHealthCard: (profileId: string) =>
    apiRequest<void>(`/profiles/${profileId}/health-card`, { ...auth, method: 'DELETE' }),
  healthCardAccesses: (profileId: string, cursor?: string) =>
    apiRequest<PaginatedResponse<HealthCardAccessResponse>>(
      `/profiles/${profileId}/health-card/accesses${query({ cursor, limit: 20 })}`,
      auth
    ),
};
