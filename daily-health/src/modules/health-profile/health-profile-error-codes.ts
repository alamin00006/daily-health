/** Error codes of the health-profile module. The app maps each to Bangla text; never rename. */
export const HealthProfileErrorCode = {
  VITAL_NOT_FOUND: 'VITAL_NOT_FOUND',
  CONDITION_NOT_FOUND: 'CONDITION_NOT_FOUND',
  /** No card issued for the profile, or (public scan) unknown, revoked or expired card. */
  HEALTH_CARD_NOT_FOUND: 'HEALTH_CARD_NOT_FOUND',
} as const;
