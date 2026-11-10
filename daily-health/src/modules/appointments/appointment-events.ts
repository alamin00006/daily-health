// The event names and payloads live in common/events (shared with payments).
export {
  APPOINTMENT_CANCELLED_EVENT,
  APPOINTMENT_COMPLETED_EVENT,
  APPOINTMENT_CONFIRMED_EVENT,
  PAYMENT_SUCCEEDED_EVENT,
  type AppointmentEvent,
  type PaymentSucceededEvent,
} from '../../common/events/booking-events.js';
