import { apiRequest } from './http-client';
import { buildQuery } from './query-string';

import type {
  CompleteAppointmentRequest,
  ProviderAppointmentResponse,
} from '@/shared-contracts/appointments.contract';
import type { PaginatedResponse } from '@/shared-contracts/common-fields.contract';
import type {
  ConsultationResponse,
  QuickConsultQueueItemResponse,
} from '@/shared-contracts/consultation.contract';
import type { SpecialtyResponse, ProviderType } from '@/shared-contracts/doctors.contract';
import type { MedicineResponse } from '@/shared-contracts/medicine.contract';
import type {
  PrescriptionResponse,
  SavePrescriptionDraftRequest,
  StartPrescriptionRequest,
} from '@/shared-contracts/prescription.contract';

const auth = { authenticated: true } as const;

/** A provider's daily work from the app: visits, quick consults, consultations, prescriptions. */
export const providerWorkEndpoints = {
  specialties: (type: ProviderType) =>
    apiRequest<SpecialtyResponse[]>(`/specialties${buildQuery({ type })}`, auth),

  // Visits
  day: (date: string) =>
    apiRequest<ProviderAppointmentResponse[]>(`/provider/me/appointments${buildQuery({ date })}`, auth),
  appointment: (id: string) =>
    apiRequest<ProviderAppointmentResponse>(`/provider/me/appointments/${id}`, auth),
  complete: (id: string, body: CompleteAppointmentRequest) =>
    apiRequest<ProviderAppointmentResponse>(`/provider/me/appointments/${id}/complete`, {
      ...auth,
      method: 'POST',
      body,
    }),
  noShow: (id: string) =>
    apiRequest<ProviderAppointmentResponse>(`/provider/me/appointments/${id}/no-show`, {
      ...auth,
      method: 'POST',
    }),
  cancel: (id: string, reason: string) =>
    apiRequest<ProviderAppointmentResponse>(`/provider/me/appointments/${id}/cancel`, {
      ...auth,
      method: 'POST',
      body: { reason },
    }),

  // Consultations
  consultations: (state: 'active' | 'past', cursor?: string) =>
    apiRequest<PaginatedResponse<ConsultationResponse>>(
      `/provider/me/consultations${buildQuery({ state, cursor, limit: 20 })}`,
      auth
    ),
  startBooked: (appointmentId: string) =>
    apiRequest<ConsultationResponse>('/provider/me/consultations', {
      ...auth,
      method: 'POST',
      body: { appointmentId },
    }),
  ring: (consultationId: string) =>
    apiRequest<ConsultationResponse>(`/provider/me/consultations/${consultationId}/ring`, {
      ...auth,
      method: 'POST',
    }),
  leaveCall: (consultationId: string) =>
    apiRequest<ConsultationResponse>(`/consultations/${consultationId}/call/leave`, {
      ...auth,
      method: 'POST',
    }),
  queue: () => apiRequest<QuickConsultQueueItemResponse[]>('/provider/me/quick-consults/queue', auth),
  accept: (consultationId: string) =>
    apiRequest<ConsultationResponse>(`/provider/me/quick-consults/${consultationId}/accept`, {
      ...auth,
      method: 'POST',
    }),

  // Prescriptions
  prescriptions: (status?: string, cursor?: string) =>
    apiRequest<PaginatedResponse<PrescriptionResponse>>(
      `/provider/me/prescriptions${buildQuery({ status, cursor, limit: 20 })}`,
      auth
    ),
  prescription: (id: string) => apiRequest<PrescriptionResponse>(`/provider/me/prescriptions/${id}`, auth),
  startPrescription: (body: StartPrescriptionRequest) =>
    apiRequest<PrescriptionResponse>('/provider/me/prescriptions', { ...auth, method: 'POST', body }),
  savePrescription: (id: string, body: SavePrescriptionDraftRequest) =>
    apiRequest<PrescriptionResponse>(`/provider/me/prescriptions/${id}`, { ...auth, method: 'PUT', body }),
  issuePrescription: (id: string) =>
    apiRequest<PrescriptionResponse>(`/provider/me/prescriptions/${id}/issue`, { ...auth, method: 'POST' }),
  revokePrescription: (id: string, reason: string) =>
    apiRequest<PrescriptionResponse>(`/provider/me/prescriptions/${id}/revoke`, {
      ...auth,
      method: 'POST',
      body: { reason },
    }),
  deletePrescription: (id: string) =>
    apiRequest<void>(`/provider/me/prescriptions/${id}`, { ...auth, method: 'DELETE' }),
  searchMedicines: (q: string) =>
    apiRequest<MedicineResponse[]>(`/medicines${buildQuery({ q, limit: 8 })}`, auth),
};
