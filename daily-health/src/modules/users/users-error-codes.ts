/** Error codes of the users module. The app maps each to Bangla text; never rename. */
export const UsersErrorCode = {
  /** Not a member, or the profile was deleted (deliberately the same answer). */
  PROFILE_NOT_FOUND: 'PROFILE_NOT_FOUND',
  /** Member, but the role does not allow this action. */
  PROFILE_ACCESS_DENIED: 'PROFILE_ACCESS_DENIED',
  /** The caller already has a SELF profile (one own profile per account). */
  OWN_PROFILE_ALREADY_EXISTS: 'OWN_PROFILE_ALREADY_EXISTS',
  /** The profile is already linked to a patient account. */
  PROFILE_ALREADY_LINKED: 'PROFILE_ALREADY_LINKED',
  MEMBER_NOT_FOUND: 'MEMBER_NOT_FOUND',
  MEMBER_ALREADY_EXISTS: 'MEMBER_ALREADY_EXISTS',
  /** Removing or demoting this member would leave the profile without an OWNER. */
  LAST_OWNER: 'LAST_OWNER',
  INVITE_NOT_FOUND: 'INVITE_NOT_FOUND',
  INVITE_ALREADY_PENDING: 'INVITE_ALREADY_PENDING',
  INVITE_EXPIRED: 'INVITE_EXPIRED',
} as const;
