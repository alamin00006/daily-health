/** Error codes of the appointments module. The apps map each to Bangla text; never rename. */
export const AppointmentsErrorCode = {
  /** Unknown, or another profile's / another provider's appointment. */
  APPOINTMENT_NOT_FOUND: 'APPOINTMENT_NOT_FOUND',
  /** The provider has no such session on that date (or it is off). */
  SESSION_NOT_AVAILABLE: 'SESSION_NOT_AVAILABLE',
  /** All serials of the session are taken. */
  SESSION_FULL: 'SESSION_FULL',
  /** The session or slot has already started, or is too soon. */
  SESSION_CLOSED: 'SESSION_CLOSED',
  /** The date is past the booking window. */
  BOOKING_TOO_FAR: 'BOOKING_TOO_FAR',
  /** A time slot was missing, not on the grid, or someone else took it. */
  SLOT_NOT_AVAILABLE: 'SLOT_NOT_AVAILABLE',
  /** This patient already has a live booking in the same session. */
  ALREADY_BOOKED: 'ALREADY_BOOKED',
  /** Home visit without an address. */
  HOME_ADDRESS_REQUIRED: 'HOME_ADDRESS_REQUIRED',
  /** The follow-up's earlier visit is not a completed visit with this provider. */
  INVALID_FOLLOW_UP: 'INVALID_FOLLOW_UP',
  /** Status does not allow this (e.g. cancelling a completed visit). */
  APPOINTMENT_STATUS_CONFLICT: 'APPOINTMENT_STATUS_CONFLICT',
  /** Less than PATIENT_CANCEL_CUTOFF_HOURS before the visit. */
  TOO_LATE_TO_CANCEL: 'TOO_LATE_TO_CANCEL',
  /** Completing or no-showing a visit that has not started yet. */
  APPOINTMENT_NOT_STARTED: 'APPOINTMENT_NOT_STARTED',
  /** Reviewing a visit that is not completed. */
  REVIEW_NOT_ALLOWED: 'REVIEW_NOT_ALLOWED',
  FOLLOW_UP_NOT_FOUND: 'FOLLOW_UP_NOT_FOUND',
  /** A follow-up set by a doctor cannot be edited by the patient (only marked done). */
  FOLLOW_UP_LOCKED: 'FOLLOW_UP_LOCKED',
} as const;
