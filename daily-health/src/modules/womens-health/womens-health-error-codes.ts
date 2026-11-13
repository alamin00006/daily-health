/** Error codes of the womens-health module. The app maps each to Bangla text; never rename. */
export const WomensHealthErrorCode = {
  /** The tracker is not offered on a profile marked male. */
  WOMENS_HEALTH_NOT_AVAILABLE: 'WOMENS_HEALTH_NOT_AVAILABLE',
  PERIOD_NOT_FOUND: 'PERIOD_NOT_FOUND',
  /** Another logged period starts within 10 days of this one. */
  PERIOD_TOO_CLOSE: 'PERIOD_TOO_CLOSE',
  /** Dates in the future cannot be logged. */
  DATE_IN_FUTURE: 'DATE_IN_FUTURE',
  /** A period longer than 15 days is a logging mistake. */
  PERIOD_TOO_LONG: 'PERIOD_TOO_LONG',
  PREGNANCY_ALREADY_ACTIVE: 'PREGNANCY_ALREADY_ACTIVE',
  PREGNANCY_NOT_FOUND: 'PREGNANCY_NOT_FOUND',
  /** LMP must be within the last ~42 weeks. */
  PREGNANCY_LMP_INVALID: 'PREGNANCY_LMP_INVALID',
} as const;
