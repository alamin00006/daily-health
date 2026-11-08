/** Error codes of the doctors module. The apps map each to Bangla text; never rename. */
export const DoctorsErrorCode = {
  /** Unknown provider, or not verified (hidden from patients). */
  PROVIDER_NOT_FOUND: 'PROVIDER_NOT_FOUND',
  /** The caller has no provider profile yet (panel: start registration). */
  PROVIDER_PROFILE_NOT_FOUND: 'PROVIDER_PROFILE_NOT_FOUND',
  PROVIDER_PROFILE_EXISTS: 'PROVIDER_PROFILE_EXISTS',
  /** Another account already uses this BMDC number. */
  BMDC_NUMBER_TAKEN: 'BMDC_NUMBER_TAKEN',
  /** Only doctors have a BMDC number. */
  BMDC_NOT_APPLICABLE: 'BMDC_NOT_APPLICABLE',
  /** A specialty id is unknown or for another provider type. */
  SPECIALTY_NOT_FOUND: 'SPECIALTY_NOT_FOUND',
  HOSPITAL_NOT_FOUND: 'HOSPITAL_NOT_FOUND',
  HOSPITAL_EXISTS: 'HOSPITAL_EXISTS',
  CHAMBER_NOT_FOUND: 'CHAMBER_NOT_FOUND',
  CHAMBER_EXISTS: 'CHAMBER_EXISTS',
  SCHEDULE_NOT_FOUND: 'SCHEDULE_NOT_FOUND',
  /** Overlaps another active schedule of the same provider on that day. */
  SCHEDULE_OVERLAP: 'SCHEDULE_OVERLAP',
  /** Online schedule for a mode without a fee (set the fee first). */
  MODE_FEE_MISSING: 'MODE_FEE_MISSING',
  SCHEDULE_EXCEPTION_NOT_FOUND: 'SCHEDULE_EXCEPTION_NOT_FOUND',
  SCHEDULE_EXCEPTION_EXISTS: 'SCHEDULE_EXCEPTION_EXISTS',
  /** Date in the past. */
  SCHEDULE_EXCEPTION_PAST: 'SCHEDULE_EXCEPTION_PAST',
  DOCUMENT_NOT_FOUND: 'DOCUMENT_NOT_FOUND',
  /** An approved document cannot be deleted. */
  DOCUMENT_LOCKED: 'DOCUMENT_LOCKED',
  /** Submit for verification with documents or sessions still missing. */
  VERIFICATION_INCOMPLETE: 'VERIFICATION_INCOMPLETE',
  /** Already verified or already waiting. */
  VERIFICATION_NOT_ALLOWED: 'VERIFICATION_NOT_ALLOWED',
  /** Going online before being verified. */
  PROVIDER_NOT_VERIFIED: 'PROVIDER_NOT_VERIFIED',
  REVIEW_EXISTS: 'REVIEW_EXISTS',
} as const;
