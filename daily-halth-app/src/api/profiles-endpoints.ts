import { apiRequest, apiUpload, type UploadFile } from './http-client';

import type { PaginatedResponse } from '@/shared-contracts/common-fields.contract';
import type {
  CreateInviteRequest,
  CreateProfileRequest,
  MeResponse,
  PatientProfileResponse,
  ProfileInviteResponse,
  ProfileMemberResponse,
  UpdateMemberRequest,
  UpdateProfileRequest,
} from '@/shared-contracts/profiles.contract';

const auth = { authenticated: true } as const;

/** /api/v1/me, /profiles, members and invites. */
export const profilesEndpoints = {
  me: () => apiRequest<MeResponse>('/me', auth),

  list: () => apiRequest<PaginatedResponse<PatientProfileResponse>>('/profiles', auth),
  get: (profileId: string) => apiRequest<PatientProfileResponse>(`/profiles/${profileId}`, auth),
  create: (body: CreateProfileRequest) =>
    apiRequest<PatientProfileResponse>('/profiles', { ...auth, method: 'POST', body }),
  update: (profileId: string, body: UpdateProfileRequest) =>
    apiRequest<PatientProfileResponse>(`/profiles/${profileId}`, {
      ...auth,
      method: 'PATCH',
      body,
    }),
  remove: (profileId: string) =>
    apiRequest<void>(`/profiles/${profileId}`, { ...auth, method: 'DELETE' }),
  setAvatar: (profileId: string, file: UploadFile) =>
    apiUpload<PatientProfileResponse>(`/profiles/${profileId}/avatar`, file, {}, 'PUT'),
  removeAvatar: (profileId: string) =>
    apiRequest<void>(`/profiles/${profileId}/avatar`, { ...auth, method: 'DELETE' }),

  members: (profileId: string) =>
    apiRequest<PaginatedResponse<ProfileMemberResponse>>(`/profiles/${profileId}/members`, auth),
  updateMember: (profileId: string, userId: string, body: UpdateMemberRequest) =>
    apiRequest<ProfileMemberResponse>(`/profiles/${profileId}/members/${userId}`, {
      ...auth,
      method: 'PATCH',
      body,
    }),
  removeMember: (profileId: string, userId: string) =>
    apiRequest<void>(`/profiles/${profileId}/members/${userId}`, { ...auth, method: 'DELETE' }),

  invites: (profileId: string) =>
    apiRequest<PaginatedResponse<ProfileInviteResponse>>(`/profiles/${profileId}/invites`, auth),
  createInvite: (profileId: string, body: CreateInviteRequest) =>
    apiRequest<ProfileInviteResponse>(`/profiles/${profileId}/invites`, {
      ...auth,
      method: 'POST',
      body,
    }),
  revokeInvite: (profileId: string, inviteId: string) =>
    apiRequest<void>(`/profiles/${profileId}/invites/${inviteId}`, {
      ...auth,
      method: 'DELETE',
    }),

  myInvites: () =>
    apiRequest<PaginatedResponse<ProfileInviteResponse>>('/me/profile-invites', auth),
  acceptInvite: (inviteId: string) =>
    apiRequest<PatientProfileResponse>(`/me/profile-invites/${inviteId}/accept`, {
      ...auth,
      method: 'POST',
    }),
  declineInvite: (inviteId: string) =>
    apiRequest<void>(`/me/profile-invites/${inviteId}/decline`, { ...auth, method: 'POST' }),
};
