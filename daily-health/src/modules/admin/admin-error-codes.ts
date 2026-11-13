/** Error codes of the admin module. The panel maps each to Bangla text; never rename. */
export const AdminErrorCode = {
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  /** No verified account with that email: the person signs up first. */
  STAFF_ACCOUNT_NOT_FOUND: 'STAFF_ACCOUNT_NOT_FOUND',
  /** Doctors, nutritionists and physiotherapists cannot also be staff. */
  STAFF_ROLE_CONFLICT: 'STAFF_ROLE_CONFLICT',
  STAFF_NOT_FOUND: 'STAFF_NOT_FOUND',
  /** Admins cannot change their own role, remove or suspend themselves. */
  STAFF_SELF_CHANGE: 'STAFF_SELF_CHANGE',
  /** At least one active admin must remain. */
  LAST_ADMIN: 'LAST_ADMIN',
} as const;
