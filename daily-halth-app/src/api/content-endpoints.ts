import { apiRequest } from './http-client';
import { buildQuery } from './query-string';

import type { PaginatedResponse } from '@/shared-contracts/common-fields.contract';
import type { HealthTipResponse, TipCategory } from '@/shared-contracts/content.contract';

/** স্বাস্থ্য টিপস: public, so guests see them too. */
export const contentEndpoints = {
  tips: (params: { category?: TipCategory; cursor?: string; limit?: number }) =>
    apiRequest<PaginatedResponse<HealthTipResponse>>(`/health-tips${buildQuery({ limit: 20, ...params })}`),
  tip: (tipId: string) => apiRequest<HealthTipResponse>(`/health-tips/${tipId}`),
};
