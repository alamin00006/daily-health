import { isApiError } from './api-error';
import { apiRequest, apiUpload, type UploadFile } from './http-client';

import type {
  MyProviderProfileResponse,
  RegisterProviderRequest,
  UpdateProviderRequest,
  VerificationDocType,
} from '@/shared-contracts/doctors.contract';

const auth = { authenticated: true } as const;

/** A doctor's / nutritionist's / physio's own provider profile (same API as the web panel). */
export const myProviderEndpoints = {
  /** null when this account has not registered as a provider. */
  get: async (): Promise<MyProviderProfileResponse | null> => {
    try {
      return await apiRequest<MyProviderProfileResponse>('/provider/me', auth);
    } catch (error) {
      if (isApiError(error) && error.code === 'PROVIDER_PROFILE_NOT_FOUND') return null;
      throw error;
    }
  },
  register: (body: RegisterProviderRequest) =>
    apiRequest<MyProviderProfileResponse>('/provider/me', { ...auth, method: 'POST', body }),
  update: (body: UpdateProviderRequest) =>
    apiRequest<MyProviderProfileResponse>('/provider/me', { ...auth, method: 'PATCH', body }),
  setAvatar: (file: UploadFile) =>
    apiUpload<MyProviderProfileResponse>('/provider/me/avatar', file, {}, 'PUT'),
  removeAvatar: () => apiRequest<void>('/provider/me/avatar', { ...auth, method: 'DELETE' }),
  uploadDocument: (file: UploadFile, docType: VerificationDocType) =>
    apiUpload<MyProviderProfileResponse>('/provider/me/documents', file, { docType }),
  removeDocument: (documentId: string) =>
    apiRequest<void>(`/provider/me/documents/${documentId}`, { ...auth, method: 'DELETE' }),
  resubmit: () =>
    apiRequest<MyProviderProfileResponse>('/provider/me/resubmit', { ...auth, method: 'POST' }),
  setOnline: (isOnline: boolean) =>
    apiRequest<MyProviderProfileResponse>('/provider/me/online', {
      ...auth,
      method: 'PUT',
      body: { isOnline },
    }),
};
