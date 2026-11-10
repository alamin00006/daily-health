/** Error codes of the prescriptions module. The apps map each to Bangla text; never rename. */
export const PrescriptionsErrorCode = {
  /** Not yours, or no such prescription (indistinguishable on purpose). */
  PRESCRIPTION_NOT_FOUND: 'PRESCRIPTION_NOT_FOUND',
  /** Only a DRAFT can be edited or deleted; only an ISSUED one revoked. */
  PRESCRIPTION_STATUS_CONFLICT: 'PRESCRIPTION_STATUS_CONFLICT',
  /** Only verified doctors write prescriptions. */
  PRESCRIBER_NOT_ALLOWED: 'PRESCRIBER_NOT_ALLOWED',
  /** The visit or consultation is not one this doctor can write for (not theirs, cancelled, not started). */
  PRESCRIPTION_SOURCE_INVALID: 'PRESCRIPTION_SOURCE_INVALID',
  /** Issuing needs at least one medicine, test or advice. */
  PRESCRIPTION_EMPTY: 'PRESCRIPTION_EMPTY',
  /** An alarm was already made from this line (details.planId). */
  ALARM_ALREADY_CREATED: 'ALARM_ALREADY_CREATED',
  PRESCRIPTION_ITEM_NOT_FOUND: 'PRESCRIPTION_ITEM_NOT_FOUND',
  PRESCRIBED_TEST_NOT_FOUND: 'PRESCRIBED_TEST_NOT_FOUND',
  /** The report is not one of this profile's files. */
  RESULT_FILE_NOT_FOUND: 'RESULT_FILE_NOT_FOUND',
} as const;
