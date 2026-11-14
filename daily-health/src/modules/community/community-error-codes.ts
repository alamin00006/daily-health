/** Error codes of the community module. The app maps each to Bangla text; never rename. */
export const CommunityErrorCode = {
  POST_NOT_FOUND: 'POST_NOT_FOUND',
  ANSWER_NOT_FOUND: 'ANSWER_NOT_FOUND',
  FORUM_CATEGORY_NOT_FOUND: 'FORUM_CATEGORY_NOT_FOUND',
  REPORT_NOT_FOUND: 'REPORT_NOT_FOUND',
  /** The women's community is for approved members only. */
  WOMEN_COMMUNITY_MEMBERS_ONLY: 'WOMEN_COMMUNITY_MEMBERS_ONLY',
  /** Only a user whose own profile is FEMALE can ask to join. */
  WOMEN_COMMUNITY_NOT_ELIGIBLE: 'WOMEN_COMMUNITY_NOT_ELIGIBLE',
  /** Already asked, approved, or removed by a moderator. */
  WOMEN_COMMUNITY_REQUEST_EXISTS: 'WOMEN_COMMUNITY_REQUEST_EXISTS',
  MEMBERSHIP_NOT_FOUND: 'MEMBERSHIP_NOT_FOUND',
  /** A moderator stopped this account from posting. */
  COMMUNITY_BANNED: 'COMMUNITY_BANNED',
  POST_IMAGE_LIMIT: 'POST_IMAGE_LIMIT',
  /** The post is hidden or removed. */
  POST_CLOSED: 'POST_CLOSED',
  ALREADY_REPORTED: 'ALREADY_REPORTED',
} as const;
