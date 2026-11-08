import { buildQuery } from './query-string';
import { apiRequest, apiUpload, type UploadFile } from './http-client';

import type { PaginatedResponse } from '@/shared-contracts/common-fields.contract';
import type {
  MedicalFileResponse,
  MedicalFileType,
  UpdateMedicalFileRequest,
} from '@/shared-contracts/records.contract';

const auth = { authenticated: true } as const;

/** Lab reports, prescription scans and other files of one profile. */
export const recordsEndpoints = {
  list: (profileId: string, params: { type?: MedicalFileType; cursor?: string }) =>
    apiRequest<PaginatedResponse<MedicalFileResponse>>(
      `/profiles/${profileId}/files${buildQuery({ ...params, limit: 20 })}`,
      auth
    ),
  get: (profileId: string, fileId: string) =>
    apiRequest<MedicalFileResponse>(`/profiles/${profileId}/files/${fileId}`, auth),
  upload: (
    profileId: string,
    file: UploadFile,
    fields: { type: MedicalFileType; title: string; reportDate: string | null }
  ) => apiUpload<MedicalFileResponse>(`/profiles/${profileId}/files`, file, fields),
  update: (profileId: string, fileId: string, body: UpdateMedicalFileRequest) =>
    apiRequest<MedicalFileResponse>(`/profiles/${profileId}/files/${fileId}`, {
      ...auth,
      method: 'PATCH',
      body,
    }),
  remove: (profileId: string, fileId: string) =>
    apiRequest<void>(`/profiles/${profileId}/files/${fileId}`, { ...auth, method: 'DELETE' }),
};
