import { apiRequest } from './http-client';
import { buildQuery } from './query-string';

import type {
  AppointmentResponse,
  AvailabilityDayResponse,
  BookAppointmentRequest,
  CreateFollowUpRequest,
  FollowUpResponse,
  ReviewAppointmentRequest,
  UpdateFollowUpRequest,
} from '@/shared-contracts/appointments.contract';
import type { PaginatedResponse } from '@/shared-contracts/common-fields.contract';
import type {
  ConsultationMode,
  FavoriteProviderResponse,
  ProviderDetailResponse,
  ProviderSummaryResponse,
  ProviderType,
  ReviewResponse,
  SpecialtyResponse,
} from '@/shared-contracts/doctors.contract';

const auth = { authenticated: true } as const;

export interface ProviderSearchFilters {
  type?: ProviderType;
  specialty?: string;
  q?: string;
  gender?: 'MALE' | 'FEMALE';
  mode?: ConsultationMode;
  onlineNow?: boolean;
}

/** Finding doctors (public: guests browse too) and "my doctors". */
export const doctorsEndpoints = {
  specialties: (type: ProviderType) =>
    apiRequest<SpecialtyResponse[]>(`/specialties${buildQuery({ type })}`),
  search: (filters: ProviderSearchFilters, cursor?: string) =>
    apiRequest<PaginatedResponse<ProviderSummaryResponse>>(
      `/providers${buildQuery({
        type: filters.type,
        specialty: filters.specialty,
        q: filters.q,
        gender: filters.gender,
        mode: filters.mode,
        onlineNow: filters.onlineNow ? 'true' : undefined,
        cursor,
        limit: 15,
      })}`
    ),
  detail: (providerId: string) => apiRequest<ProviderDetailResponse>(`/providers/${providerId}`),
  reviews: (providerId: string, cursor?: string) =>
    apiRequest<PaginatedResponse<ReviewResponse>>(
      `/providers/${providerId}/reviews${buildQuery({ cursor, limit: 20 })}`
    ),
  availability: (providerId: string, mode: ConsultationMode, from?: string) =>
    apiRequest<AvailabilityDayResponse[]>(
      `/providers/${providerId}/availability${buildQuery({ mode, from, days: 14 })}`
    ),

  favorites: (profileId: string) =>
    apiRequest<FavoriteProviderResponse[]>(`/profiles/${profileId}/favorite-providers`, auth),
  addFavorite: (profileId: string, providerId: string) =>
    apiRequest<void>(`/profiles/${profileId}/favorite-providers/${providerId}`, {
      ...auth,
      method: 'PUT',
    }),
  removeFavorite: (profileId: string, providerId: string) =>
    apiRequest<void>(`/profiles/${profileId}/favorite-providers/${providerId}`, {
      ...auth,
      method: 'DELETE',
    }),
};

/** A profile's bookings and follow-ups. */
export const appointmentsEndpoints = {
  book: (profileId: string, body: BookAppointmentRequest) =>
    apiRequest<AppointmentResponse>(`/profiles/${profileId}/appointments`, {
      ...auth,
      method: 'POST',
      body,
    }),
  list: (profileId: string, scope: 'upcoming' | 'past', cursor?: string) =>
    apiRequest<PaginatedResponse<AppointmentResponse>>(
      `/profiles/${profileId}/appointments${buildQuery({ scope, cursor, limit: 20 })}`,
      auth
    ),
  get: (profileId: string, appointmentId: string) =>
    apiRequest<AppointmentResponse>(`/profiles/${profileId}/appointments/${appointmentId}`, auth),
  cancel: (profileId: string, appointmentId: string, reason?: string) =>
    apiRequest<AppointmentResponse>(
      `/profiles/${profileId}/appointments/${appointmentId}/cancel`,
      { ...auth, method: 'POST', body: { reason } }
    ),
  review: (profileId: string, appointmentId: string, body: ReviewAppointmentRequest) =>
    apiRequest<AppointmentResponse>(
      `/profiles/${profileId}/appointments/${appointmentId}/review`,
      { ...auth, method: 'POST', body }
    ),


  followUps: (profileId: string, scope: 'upcoming' | 'past') =>
    apiRequest<PaginatedResponse<FollowUpResponse>>(
      `/profiles/${profileId}/follow-ups${buildQuery({ scope, limit: 50 })}`,
      auth
    ),
  createFollowUp: (profileId: string, body: CreateFollowUpRequest) =>
    apiRequest<FollowUpResponse>(`/profiles/${profileId}/follow-ups`, {
      ...auth,
      method: 'POST',
      body,
    }),
  updateFollowUp: (profileId: string, followUpId: string, body: UpdateFollowUpRequest) =>
    apiRequest<FollowUpResponse>(`/profiles/${profileId}/follow-ups/${followUpId}`, {
      ...auth,
      method: 'PATCH',
      body,
    }),
  deleteFollowUp: (profileId: string, followUpId: string) =>
    apiRequest<void>(`/profiles/${profileId}/follow-ups/${followUpId}`, {
      ...auth,
      method: 'DELETE',
    }),
};
