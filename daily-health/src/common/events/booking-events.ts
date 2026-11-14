/**
 * Events between the appointments and payments modules (CLAUDE.md §4: side
 * effects across modules go through events). Kept here so neither module
 * imports the other's files.
 */
export const PAYMENT_SUCCEEDED_EVENT = 'payment.succeeded';
export interface PaymentSucceededEvent {
  purpose: 'APPOINTMENT' | 'QUICK_CONSULT' | 'DIET_PLAN' | 'ORDER';
  referenceId: string;
  paymentId: string | null;
}

export const APPOINTMENT_CONFIRMED_EVENT = 'appointment.confirmed';
export const APPOINTMENT_CANCELLED_EVENT = 'appointment.cancelled';
export const APPOINTMENT_COMPLETED_EVENT = 'appointment.completed';

export interface AppointmentEvent {
  appointmentId: string;
  patientId: string;
  providerId: string;
  /** Who acted; null = system. */
  actorUserId: string | null;
  /** Cancelled only: it had been paid, so the money goes back. */
  wasConfirmed?: boolean;
  /** Cancelled only: who cancelled (refund text). */
  cancelledBy?: 'PATIENT' | 'PROVIDER' | 'SYSTEM';
}

/**
 * A module asks for the payment of something it owns to be refunded in full
 * (a quick consult no doctor took, or one cancelled while waiting).
 */
export const PAYMENT_REFUND_REQUESTED_EVENT = 'payment.refund-requested';
export interface PaymentRefundRequestedEvent {
  purpose: 'APPOINTMENT' | 'QUICK_CONSULT' | 'DIET_PLAN' | 'ORDER';
  referenceId: string;
  /** Bangla, shown to the payer and the admin. */
  reason: string;
}

/**
 * The provider of an already paid item became known (a doctor took a quick
 * consult): the payment is credited to them as an earning.
 */
export const PAYMENT_PROVIDER_ASSIGNED_EVENT = 'payment.provider-assigned';
export interface PaymentProviderAssignedEvent {
  purpose: 'APPOINTMENT' | 'QUICK_CONSULT' | 'DIET_PLAN' | 'ORDER';
  referenceId: string;
  providerId: string;
}
