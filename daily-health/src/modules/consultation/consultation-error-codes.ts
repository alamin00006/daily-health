/** Error codes of the consultation module. The apps map each to Bangla text; never rename. */
export const ConsultationErrorCode = {
  /** Not yours, or no such consultation (indistinguishable on purpose). */
  CONSULTATION_NOT_FOUND: 'CONSULTATION_NOT_FOUND',
  /** The consultation is not in a state that allows this. */
  CONSULTATION_STATUS_CONFLICT: 'CONSULTATION_STATUS_CONFLICT',
  /** Admins turned this quick consult off. */
  QUICK_CONSULT_DISABLED: 'QUICK_CONSULT_DISABLED',
  /** No eligible doctor is online now, so nobody could take it. */
  NO_DOCTOR_ONLINE: 'NO_DOCTOR_ONLINE',
  /** The patient already has a quick consult that is not finished (details.consultationId). */
  QUICK_CONSULT_ALREADY_ACTIVE: 'QUICK_CONSULT_ALREADY_ACTIVE',
  /** Another doctor took it first. */
  QUICK_CONSULT_TAKEN: 'QUICK_CONSULT_TAKEN',
  /** The provider cannot take quick consults (not verified, not online, gender, setting). */
  QUICK_CONSULT_NOT_ELIGIBLE: 'QUICK_CONSULT_NOT_ELIGIBLE',
  /** Only VIDEO and CHAT bookings run as consultations. */
  NOT_AN_ONLINE_APPOINTMENT: 'NOT_AN_ONLINE_APPOINTMENT',
  /** Too early or too late to start this booking's consultation. */
  OUTSIDE_CONSULT_WINDOW: 'OUTSIDE_CONSULT_WINDOW',
  /** The doctor has not opened the call yet. */
  CALL_NOT_STARTED: 'CALL_NOT_STARTED',
  /** Chat consult: there is no call. */
  NOT_A_CALL: 'NOT_A_CALL',
  /** AGORA_APP_ID / AGORA_APP_CERTIFICATE are not set on the server. */
  VIDEO_NOT_CONFIGURED: 'VIDEO_NOT_CONFIGURED',
} as const;
