import { apiRequest } from './http-client';
import { buildQuery } from './query-string';

import type {
  CreatePeriodRequest,
  CycleOverviewResponse,
  CycleSettingsResponse,
  DailyLogResponse,
  PeriodResponse,
  PregnancyResponse,
  SaveDailyLogRequest,
  StartPregnancyRequest,
  UpdateCycleSettingsRequest,
  UpdatePeriodRequest,
} from '@/shared-contracts/womens-health.contract';

const auth = { authenticated: true } as const;
const base = (profileId: string) => `/profiles/${profileId}/womens-health`;

/** Period tracker, daily log and pregnancy of one profile (the patient themself only). */
export const womensHealthEndpoints = {
  overview: (profileId: string) => apiRequest<CycleOverviewResponse>(base(profileId), auth),
  updateSettings: (profileId: string, body: UpdateCycleSettingsRequest) =>
    apiRequest<CycleSettingsResponse>(`${base(profileId)}/settings`, { ...auth, method: 'PUT', body }),

  periods: (profileId: string) => apiRequest<PeriodResponse[]>(`${base(profileId)}/periods`, auth),
  createPeriod: (profileId: string, body: CreatePeriodRequest) =>
    apiRequest<PeriodResponse>(`${base(profileId)}/periods`, { ...auth, method: 'POST', body }),
  updatePeriod: (profileId: string, periodId: string, body: UpdatePeriodRequest) =>
    apiRequest<PeriodResponse>(`${base(profileId)}/periods/${periodId}`, { ...auth, method: 'PATCH', body }),
  removePeriod: (profileId: string, periodId: string) =>
    apiRequest<void>(`${base(profileId)}/periods/${periodId}`, { ...auth, method: 'DELETE' }),

  logs: (profileId: string, from: string, to: string) =>
    apiRequest<DailyLogResponse[]>(`${base(profileId)}/logs${buildQuery({ from, to })}`, auth),
  saveLog: (profileId: string, date: string, body: SaveDailyLogRequest) =>
    apiRequest<DailyLogResponse | null>(`${base(profileId)}/logs/${date}`, { ...auth, method: 'PUT', body }),

  startPregnancy: (profileId: string, body: StartPregnancyRequest) =>
    apiRequest<PregnancyResponse>(`${base(profileId)}/pregnancy`, { ...auth, method: 'POST', body }),
  endPregnancy: (profileId: string) =>
    apiRequest<void>(`${base(profileId)}/pregnancy/end`, { ...auth, method: 'POST' }),
};
