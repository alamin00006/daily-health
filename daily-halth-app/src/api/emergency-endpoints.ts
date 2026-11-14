import { apiRequest } from './http-client';
import { buildQuery } from './query-string';

import type { PaginatedResponse } from '@/shared-contracts/common-fields.contract';
import type {
  AddEmergencyLocationRequest,
  CreateEmergencyContactRequest,
  CreateEmergencyRequest,
  EmergencyContactResponse,
  EmergencyRequestResponse,
  RaiseEmergencyResponse,
  UpdateEmergencyContactRequest,
} from '@/shared-contracts/emergency.contract';

const auth = { authenticated: true } as const;

/** আকস্মিক সেবা: emergency contacts and the SOS button of one profile. */
export const emergencyEndpoints = {
  contacts: (profileId: string) =>
    apiRequest<EmergencyContactResponse[]>(`/profiles/${profileId}/emergency-contacts`, auth),
  addContact: (profileId: string, body: CreateEmergencyContactRequest) =>
    apiRequest<EmergencyContactResponse>(`/profiles/${profileId}/emergency-contacts`, { ...auth, method: 'POST', body }),
  updateContact: (profileId: string, contactId: string, body: UpdateEmergencyContactRequest) =>
    apiRequest<EmergencyContactResponse>(`/profiles/${profileId}/emergency-contacts/${contactId}`, {
      ...auth,
      method: 'PATCH',
      body,
    }),
  removeContact: (profileId: string, contactId: string) =>
    apiRequest<void>(`/profiles/${profileId}/emergency-contacts/${contactId}`, { ...auth, method: 'DELETE' }),

  raise: (profileId: string, body: CreateEmergencyRequest) =>
    apiRequest<RaiseEmergencyResponse>(`/profiles/${profileId}/emergency-requests`, { ...auth, method: 'POST', body }),
  active: (profileId: string) =>
    apiRequest<EmergencyRequestResponse | null>(`/profiles/${profileId}/emergency-requests/active`, auth),
  history: (profileId: string, cursor?: string) =>
    apiRequest<PaginatedResponse<EmergencyRequestResponse>>(
      `/profiles/${profileId}/emergency-requests${buildQuery({ cursor, limit: 20 })}`,
      auth
    ),
  addLocation: (profileId: string, requestId: string, body: AddEmergencyLocationRequest) =>
    apiRequest<EmergencyRequestResponse>(`/profiles/${profileId}/emergency-requests/${requestId}/location`, {
      ...auth,
      method: 'POST',
      body,
    }),
  cancel: (profileId: string, requestId: string) =>
    apiRequest<EmergencyRequestResponse>(`/profiles/${profileId}/emergency-requests/${requestId}/cancel`, {
      ...auth,
      method: 'POST',
    }),
};
