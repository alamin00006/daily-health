import { z } from 'zod';
import { paginationQuerySchema } from './common-fields.contract.js';

/**
 * Community (CLAUDE.md §1, feature 9). Two spaces:
 * - COMMON: every registered user posts and answers; guests read.
 * - WOMEN: closed. A user whose own (SELF) profile is FEMALE asks to join, a
 *   moderator approves once; only approved members (and staff) see it.
 */

export const communitySpaceSchema = z.enum(['COMMON', 'WOMEN']);
export type CommunitySpace = z.infer<typeof communitySpaceSchema>;

export const postStatusSchema = z.enum(['PUBLISHED', 'HIDDEN', 'REMOVED']);
export type PostStatus = z.infer<typeof postStatusSchema>;

export const reportTargetSchema = z.enum(['POST', 'ANSWER']);
export type ReportTarget = z.infer<typeof reportTargetSchema>;

export const reportReasonSchema = z.enum(['SPAM', 'MISINFO', 'ABUSE', 'ADS', 'PRIVACY', 'OTHER']);
export type ReportReason = z.infer<typeof reportReasonSchema>;

export const reportStatusSchema = z.enum(['OPEN', 'RESOLVED', 'DISMISSED']);
export type ReportStatus = z.infer<typeof reportStatusSchema>;

export const womenMembershipStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'REMOVED']);
export type WomenMembershipStatus = z.infer<typeof womenMembershipStatusSchema>;

export const banScopeSchema = z.enum(['ALL', 'WOMEN']);
export type BanScope = z.infer<typeof banScopeSchema>;

export const MAX_POST_IMAGES = 3;

// ---------------------------------------------------------------------------
// Categories and access
// ---------------------------------------------------------------------------

export interface ForumCategoryResponse {
  id: string;
  slug: string;
  nameBn: string;
  space: CommunitySpace;
  /** Previews are blurred and push text never carries the content. */
  isSensitive: boolean;
  postCount: number;
}

// GET /api/v1/community/access
export interface CommunityAccessResponse {
  /** false for guests: they read the common space only. */
  canPost: boolean;
  /** Banned from posting (scope ALL) with the reason. */
  bannedReason: string | null;
  women: {
    status: WomenMembershipStatus | 'NONE';
    /** Only a user whose own profile says FEMALE can ask to join. */
    canRequest: boolean;
    /** Why they cannot ask (no own profile, not FEMALE, banned). */
    blockedReason: 'NO_OWN_PROFILE' | 'NOT_FEMALE' | 'BANNED' | null;
    /** Note from the moderator on rejection or removal. */
    note: string | null;
  };
}

// POST /api/v1/community/women/join-request
export const womenJoinRequestSchema = z.object({
  /** A line for the moderator, optional. */
  note: z.string().trim().max(300).optional(),
});
export type WomenJoinRequest = z.infer<typeof womenJoinRequestSchema>;

// ---------------------------------------------------------------------------
// Posts and answers
// ---------------------------------------------------------------------------

export interface CommunityAuthor {
  /** Name shown: the person's own profile name, a doctor's title, or the alias. */
  displayName: string;
  isAnonymous: boolean;
  /** Set when a verified provider wrote it. */
  provider: { id: string; type: 'DOCTOR' | 'NUTRITIONIST' | 'PHYSIO'; designation: string | null } | null;
  /** The viewer wrote it (to show delete). */
  isMe: boolean;
}

export interface PostSummaryResponse {
  id: string;
  space: CommunitySpace;
  category: Pick<ForumCategoryResponse, 'id' | 'slug' | 'nameBn' | 'isSensitive'>;
  title: string;
  /** First ~220 characters. */
  excerpt: string;
  author: CommunityAuthor;
  answerCount: number;
  doctorAnswerCount: number;
  likeCount: number;
  likedByMe: boolean;
  imageCount: number;
  createdAt: string;
}

export interface PostImageResponse {
  id: string;
  /** Signed, expiring (posts are private to the app). */
  url: string;
  thumbnailUrl: string;
}

export interface PostResponse extends Omit<PostSummaryResponse, 'excerpt'> {
  body: string;
  images: PostImageResponse[];
  status: PostStatus;
}

export interface AnswerResponse {
  id: string;
  postId: string;
  body: string;
  author: CommunityAuthor;
  likeCount: number;
  likedByMe: boolean;
  /** Pinned by a moderator as a good answer. */
  isHighlighted: boolean;
  createdAt: string;
}

// GET /api/v1/community/posts?space=&categoryId=&q=&mine=
export const listPostsQuerySchema = paginationQuerySchema.extend({
  space: communitySpaceSchema.default('COMMON'),
  categoryId: z.uuid().optional(),
  q: z.string().trim().max(80).optional(),
  mine: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  /** Only posts with a verified doctor's answer. */
  answeredByDoctor: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;

export const listAnswersQuerySchema = paginationQuerySchema;

// POST /api/v1/community/posts
export const createPostRequestSchema = z.object({
  categoryId: z.uuid(),
  title: z.string().trim().min(5).max(150),
  body: z.string().trim().min(10).max(5000),
  isAnonymous: z.boolean().default(false),
});
export type CreatePostRequest = z.infer<typeof createPostRequestSchema>;

// POST /api/v1/community/posts/:postId/answers
export const createAnswerRequestSchema = z.object({
  body: z.string().trim().min(2).max(3000),
  isAnonymous: z.boolean().default(false),
});
export type CreateAnswerRequest = z.infer<typeof createAnswerRequestSchema>;

// PUT /api/v1/community/likes   { targetType, targetId, liked }
export const setLikeRequestSchema = z.object({
  targetType: reportTargetSchema,
  targetId: z.uuid(),
  liked: z.boolean(),
});
export type SetLikeRequest = z.infer<typeof setLikeRequestSchema>;
export interface LikeResponse {
  liked: boolean;
  likeCount: number;
}

// POST /api/v1/community/reports
export const createReportRequestSchema = z.object({
  targetType: reportTargetSchema,
  targetId: z.uuid(),
  reason: reportReasonSchema,
  note: z.string().trim().max(500).optional(),
});
export type CreateReportRequest = z.infer<typeof createReportRequestSchema>;

// ---------------------------------------------------------------------------
// Staff (MODERATOR, ADMIN)
// ---------------------------------------------------------------------------

export interface StaffReportResponse {
  id: string;
  targetType: ReportTarget;
  targetId: string;
  /** What was reported, for reading in the panel. */
  target: {
    space: CommunitySpace;
    postId: string;
    title: string | null;
    body: string;
    status: PostStatus;
    authorUserId: string;
    authorName: string | null;
    isAnonymous: boolean;
  } | null;
  reason: ReportReason;
  note: string | null;
  status: ReportStatus;
  reportCount: number;
  reporterName: string | null;
  resolvedByName: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export const listReportsQuerySchema = paginationQuerySchema.extend({
  status: reportStatusSchema.default('OPEN'),
});
export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>;

// POST /api/v1/staff/community/reports/:reportId/resolve
export const resolveReportRequestSchema = z.object({
  /** HIDE: hide the post/answer; DISMISS: nothing wrong; BAN: hide and ban the author. */
  action: z.enum(['HIDE', 'DISMISS', 'BAN']),
  banScope: banScopeSchema.default('ALL'),
  note: z.string().trim().max(300).optional(),
});
export type ResolveReportRequest = z.infer<typeof resolveReportRequestSchema>;

// POST /api/v1/staff/community/{posts|answers}/:id/{hide|restore|highlight|unhighlight}
export const moderationNoteSchema = z.object({ note: z.string().trim().max(300).optional() });
export type ModerationNote = z.infer<typeof moderationNoteSchema>;

export interface WomenMembershipResponse {
  userId: string;
  name: string | null;
  patientCode: string | null;
  email: string | null;
  status: WomenMembershipStatus;
  requestNote: string | null;
  decisionNote: string | null;
  decidedByName: string | null;
  requestedAt: string;
  decidedAt: string | null;
}

export const listMembershipsQuerySchema = paginationQuerySchema.extend({
  status: womenMembershipStatusSchema.default('PENDING'),
});
export type ListMembershipsQuery = z.infer<typeof listMembershipsQuerySchema>;

// POST /api/v1/staff/community/women/:userId/{approve|reject|remove}
export const decideMembershipRequestSchema = z.object({ note: z.string().trim().max(300).optional() });
export type DecideMembershipRequest = z.infer<typeof decideMembershipRequestSchema>;

export interface CommunityBanResponse {
  userId: string;
  name: string | null;
  scope: BanScope;
  reason: string;
  bannedByName: string | null;
  createdAt: string;
}

// POST /api/v1/staff/community/bans
export const createBanRequestSchema = z.object({
  userId: z.uuid(),
  scope: banScopeSchema,
  reason: z.string().trim().min(3).max(300),
});
export type CreateBanRequest = z.infer<typeof createBanRequestSchema>;

export interface CommunityStaffCountsResponse {
  openReports: number;
  pendingWomenRequests: number;
}
