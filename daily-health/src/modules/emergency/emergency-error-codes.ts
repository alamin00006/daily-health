/** Error codes of the emergency module. The app maps each to Bangla text; never rename. */
export const EmergencyErrorCode = {
  EMERGENCY_CONTACT_NOT_FOUND: 'EMERGENCY_CONTACT_NOT_FOUND',
  /** At most EMERGENCY_CONTACTS_MAX contacts per profile. */
  EMERGENCY_CONTACTS_LIMIT: 'EMERGENCY_CONTACTS_LIMIT',
  /** The same number is already a contact of this profile. */
  EMERGENCY_CONTACT_DUPLICATE: 'EMERGENCY_CONTACT_DUPLICATE',
  EMERGENCY_REQUEST_NOT_FOUND: 'EMERGENCY_REQUEST_NOT_FOUND',
  /** The request is already closed or cancelled (or dispatched, for dispatch). */
  EMERGENCY_STATUS_CONFLICT: 'EMERGENCY_STATUS_CONFLICT',
} as const;
