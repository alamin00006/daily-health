import { apiRequest } from './http-client';
import { buildQuery } from './query-string';

import type { PaginatedResponse } from '@/shared-contracts/common-fields.contract';
import type { MedicationPlanResponse } from '@/shared-contracts/medicine.contract';
import type {
  CreateAlarmFromItemRequest,
  LinkTestResultRequest,
  PrescriptionResponse,
} from '@/shared-contracts/prescription.contract';

const auth = { authenticated: true } as const;

/** A profile's prescriptions, alarms from medicine lines, and test reports. */
export const prescriptionsEndpoints = {
  list: (profileId: string, cursor?: string) =>
    apiRequest<PaginatedResponse<PrescriptionResponse>>(
      `/profiles/${profileId}/prescriptions${buildQuery({ cursor, limit: 20 })}`,
      auth
    ),
  get: (profileId: string, prescriptionId: string) =>
    apiRequest<PrescriptionResponse>(`/profiles/${profileId}/prescriptions/${prescriptionId}`, auth),
  createAlarm: (
    profileId: string,
    prescriptionId: string,
    itemId: string,
    body: CreateAlarmFromItemRequest = {}
  ) =>
    apiRequest<MedicationPlanResponse>(
      `/profiles/${profileId}/prescriptions/${prescriptionId}/items/${itemId}/alarm`,
      { ...auth, method: 'POST', body }
    ),
  linkTestResult: (
    profileId: string,
    prescriptionId: string,
    testId: string,
    body: LinkTestResultRequest
  ) =>
    apiRequest<PrescriptionResponse>(
      `/profiles/${profileId}/prescriptions/${prescriptionId}/tests/${testId}/result`,
      { ...auth, method: 'PUT', body }
    ),
};
