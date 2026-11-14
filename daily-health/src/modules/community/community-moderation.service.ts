import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception.js';
import { afterCursor, toKeysetPage } from '../../common/pagination/keyset-cursor.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { BanScope, ContentReport } from '../../generated/prisma/client.js';
import type { PaginatedResponse, PaginationQuery } from '../../shared-contracts/common-fields.contract.js';
import type {
  CommunityBanResponse,
  CommunityStaffCountsResponse,
  CreateBanRequest,
  ListMembershipsQuery,
  ListReportsQuery,
  ResolveReportRequest,
  StaffReportResponse,
  WomenMembershipResponse,
} from '../../shared-contracts/community.contract.js';
import { StaffDirectoryService } from '../admin/staff-directory.service.js';
import { UserAccountsService } from '../auth/user-accounts.service.js';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service.js';
import { PatientProfilesService } from '../users/patient-profiles.service.js';
import { CommunityErrorCode } from './community-error-codes.js';
import { CommunityPostsService } from './community-posts.service.js';

/** What moderators and admins do in the panel. */
@Injectable()
export class CommunityModerationService {
  private readonly logger = new Logger(CommunityModerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: CommunityPostsService,
    private readonly staff: StaffDirectoryService,
    private readonly profiles: PatientProfilesService,
    private readonly accounts: UserAccountsService,
    private readonly delivery: NotificationDeliveryService,
  ) {}

  async counts(): Promise<CommunityStaffCountsResponse> {
    const [openReports, pendingWomenRequests] = await Promise.all([
      this.prisma.contentReport.count({ where: { status: 'OPEN' } }),
      this.prisma.womenCommunityMember.count({ where: { status: 'PENDING' } }),
    ]);
    return { openReports, pendingWomenRequests };
  }

  // -------------------------------------------------------------------------
  // Reports
  // -------------------------------------------------------------------------

  async reports(query: ListReportsQuery): Promise<PaginatedResponse<StaffReportResponse>> {
    const rows = await this.prisma.contentReport.findMany({
      where: { status: query.status, ...afterCursor('createdAt', query.cursor) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = toKeysetPage(rows, query.limit, (r) => r.createdAt, (r) => r);
    return { data: await this.reportViews(page.data), meta: page.meta };
  }

  /**
   * HIDE hides the reported post/answer; BAN also bans its author; DISMISS keeps it.
   * Every open report on the same target is closed with it.
   */
  async resolve(staffUserId: string, reportId: string, input: ResolveReportRequest): Promise<StaffReportResponse> {
    const report = await this.prisma.contentReport.findUnique({ where: { id: reportId } });
    if (!report) throw new AppException(CommunityErrorCode.REPORT_NOT_FOUND, 'Report not found', HttpStatus.NOT_FOUND);
    if (input.action !== 'DISMISS') {
      const authorUserId = await this.hideTarget(report.targetType, report.targetId, input.note ?? 'রিপোর্টের পর লুকানো হয়েছে');
      if (input.action === 'BAN' && authorUserId) {
        await this.ban(staffUserId, { userId: authorUserId, scope: input.banScope, reason: input.note ?? 'কমিউনিটির নিয়ম ভঙ্গ' });
      }
    }
    await this.prisma.contentReport.updateMany({
      where: { targetType: report.targetType, targetId: report.targetId, status: 'OPEN' },
      data: { status: input.action === 'DISMISS' ? 'DISMISSED' : 'RESOLVED', resolvedByUserId: staffUserId, resolvedAt: new Date() },
    });
    const updated = await this.prisma.contentReport.findUniqueOrThrow({ where: { id: reportId } });
    return (await this.reportViews([updated]))[0];
  }

  // -------------------------------------------------------------------------
  // Posts and answers
  // -------------------------------------------------------------------------

  async setPostHidden(postId: string, hidden: boolean, note?: string): Promise<void> {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.status === 'REMOVED') {
      throw new AppException(CommunityErrorCode.POST_NOT_FOUND, 'Post not found', HttpStatus.NOT_FOUND);
    }
    await this.prisma.post.update({
      where: { id: postId },
      data: { status: hidden ? 'HIDDEN' : 'PUBLISHED', moderationNote: hidden ? (note ?? null) : null },
    });
  }

  async setAnswerHidden(answerId: string, hidden: boolean, note?: string): Promise<void> {
    const answer = await this.prisma.answer.findUnique({ where: { id: answerId } });
    if (!answer || answer.status === 'REMOVED') {
      throw new AppException(CommunityErrorCode.ANSWER_NOT_FOUND, 'Answer not found', HttpStatus.NOT_FOUND);
    }
    await this.posts.setAnswerStatus(answer, hidden ? 'HIDDEN' : 'PUBLISHED', hidden ? note : null);
  }

  async setAnswerHighlighted(answerId: string, highlighted: boolean): Promise<void> {
    const changed = await this.prisma.answer.updateMany({
      where: { id: answerId, status: 'PUBLISHED' },
      data: { isHighlighted: highlighted },
    });
    if (changed.count === 0) {
      throw new AppException(CommunityErrorCode.ANSWER_NOT_FOUND, 'Answer not found', HttpStatus.NOT_FOUND);
    }
  }

  // -------------------------------------------------------------------------
  // Women's community membership
  // -------------------------------------------------------------------------

  async memberships(query: ListMembershipsQuery): Promise<PaginatedResponse<WomenMembershipResponse>> {
    const rows = await this.prisma.womenCommunityMember.findMany({
      where: { status: query.status, ...afterCursor('requestedAt', query.cursor) },
      orderBy: [{ requestedAt: 'desc' }, { userId: 'desc' }],
      take: query.limit + 1,
    });
    const page = toKeysetPage(
      rows.map((r) => ({ ...r, id: r.userId })),
      query.limit,
      (r) => r.requestedAt,
      (r) => r,
    );
    const ids = page.data.map((r) => r.userId);
    const [own, accounts, deciders] = await Promise.all([
      this.profiles.ownProfilesByUserIds(ids),
      this.accounts.findManyByIds(ids),
      this.staff.namesByUserIds(page.data.flatMap((r) => (r.decidedByUserId ? [r.decidedByUserId] : []))),
    ]);
    return {
      data: page.data.map((r) => ({
        userId: r.userId,
        name: own.get(r.userId)?.fullName ?? null,
        patientCode: own.get(r.userId)?.patientCode ?? null,
        email: accounts.get(r.userId)?.email ?? null,
        status: r.status,
        requestNote: r.requestNote,
        decisionNote: r.decisionNote,
        decidedByName: r.decidedByUserId ? (deciders.get(r.decidedByUserId) ?? null) : null,
        requestedAt: r.requestedAt.toISOString(),
        decidedAt: r.decidedAt?.toISOString() ?? null,
      })),
      meta: page.meta,
    };
  }

  /**
   * approve: PENDING → APPROVED, or REMOVED → APPROVED (a moderator lets someone back in);
   * reject: PENDING → REJECTED (may ask again); remove: APPROVED → REMOVED (cannot ask again).
   */
  async decide(staffUserId: string, userId: string, decision: 'approve' | 'reject' | 'remove', note?: string): Promise<void> {
    const from = decision === 'remove' ? ['APPROVED'] : decision === 'approve' ? ['PENDING', 'REMOVED'] : ['PENDING'];
    const to = decision === 'approve' ? 'APPROVED' : decision === 'reject' ? 'REJECTED' : 'REMOVED';
    const changed = await this.prisma.womenCommunityMember.updateMany({
      where: { userId, status: { in: from as ('PENDING' | 'APPROVED' | 'REMOVED')[] } },
      data: { status: to, decisionNote: note ?? null, decidedByUserId: staffUserId, decidedAt: new Date() },
    });
    if (changed.count === 0) {
      throw new AppException(CommunityErrorCode.MEMBERSHIP_NOT_FOUND, 'No such request in that state', HttpStatus.CONFLICT);
    }
    // Generic text: membership of the women's community is itself private.
    const text =
      decision === 'approve'
        ? 'আপনার অনুরোধ গ্রহণ করা হয়েছে। এখন কমিউনিটিতে যোগ দিতে পারবেন।'
        : decision === 'reject'
          ? 'আপনার অনুরোধ এবার গ্রহণ করা যায়নি। অ্যাপে কারণ দেখুন।'
          : 'আপনার কমিউনিটি সদস্যপদ বদলেছে। অ্যাপে দেখুন।';
    try {
      await this.delivery.deliver([
        {
          userId,
          type: 'community.membership',
          title: 'কমিউনিটি',
          body: text,
          data: { screen: 'community-women' },
          channels: ['PUSH', 'IN_APP'],
          sensitive: true,
        },
      ]);
    } catch (error) {
      this.logger.warn(`Membership notification failed: ${(error as Error).message}`);
    }
  }

  // -------------------------------------------------------------------------
  // Bans
  // -------------------------------------------------------------------------

  async bans(query: PaginationQuery): Promise<PaginatedResponse<CommunityBanResponse>> {
    const rows = await this.prisma.communityBan.findMany({
      where: afterCursor('createdAt', query.cursor),
      orderBy: [{ createdAt: 'desc' }, { userId: 'desc' }],
      take: query.limit + 1,
    });
    const page = toKeysetPage(
      rows.map((r) => ({ ...r, id: `${r.userId}:${r.scope}` })),
      query.limit,
      (r) => r.createdAt,
      (r) => r,
    );
    const [own, staff] = await Promise.all([
      this.profiles.ownProfilesByUserIds(page.data.map((r) => r.userId)),
      this.staff.namesByUserIds(page.data.map((r) => r.bannedByUserId)),
    ]);
    return {
      data: page.data.map((r) => ({
        userId: r.userId,
        name: own.get(r.userId)?.fullName ?? null,
        scope: r.scope,
        reason: r.reason,
        bannedByName: staff.get(r.bannedByUserId) ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: page.meta,
    };
  }

  async ban(staffUserId: string, input: CreateBanRequest): Promise<void> {
    const account = await this.accounts.findById(input.userId);
    if (!account) throw new AppException('USER_NOT_FOUND', 'User not found', HttpStatus.NOT_FOUND);
    await this.prisma.communityBan.upsert({
      where: { userId_scope: { userId: input.userId, scope: input.scope } },
      create: { userId: input.userId, scope: input.scope, reason: input.reason, bannedByUserId: staffUserId },
      update: { reason: input.reason, bannedByUserId: staffUserId },
    });
  }

  async unban(userId: string, scope: BanScope): Promise<void> {
    await this.prisma.communityBan.deleteMany({ where: { userId, scope } });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Hides a post or answer; returns its author (for a ban). */
  private async hideTarget(targetType: 'POST' | 'ANSWER', targetId: string, note: string): Promise<string | null> {
    if (targetType === 'POST') {
      const post = await this.prisma.post.findUnique({ where: { id: targetId } });
      if (!post) return null;
      if (post.status === 'PUBLISHED') await this.setPostHidden(targetId, true, note);
      return post.authorUserId;
    }
    const answer = await this.prisma.answer.findUnique({ where: { id: targetId } });
    if (!answer) return null;
    if (answer.status === 'PUBLISHED') await this.posts.setAnswerStatus(answer, 'HIDDEN', note);
    return answer.authorUserId;
  }

  private async reportViews(rows: ContentReport[]): Promise<StaffReportResponse[]> {
    const postIds = rows.filter((r) => r.targetType === 'POST').map((r) => r.targetId);
    const answerIds = rows.filter((r) => r.targetType === 'ANSWER').map((r) => r.targetId);
    const [posts, answers, counts] = await Promise.all([
      this.prisma.post.findMany({ where: { id: { in: postIds } } }),
      this.prisma.answer.findMany({ where: { id: { in: answerIds } }, include: { post: true } }),
      this.prisma.contentReport.groupBy({
        by: ['targetType', 'targetId'],
        where: { targetId: { in: [...postIds, ...answerIds] } },
        _count: { _all: true },
      }),
    ]);
    const postMap = new Map(posts.map((p) => [p.id, p]));
    const answerMap = new Map(answers.map((a) => [a.id, a]));
    const authorIds = [...posts.map((p) => p.authorUserId), ...answers.map((a) => a.authorUserId)];
    const [names, reporters, staff] = await Promise.all([
      this.profiles.ownNamesByUserIds(authorIds),
      this.profiles.ownNamesByUserIds(rows.map((r) => r.reporterUserId)),
      this.staff.namesByUserIds(rows.flatMap((r) => (r.resolvedByUserId ? [r.resolvedByUserId] : []))),
    ]);
    return rows.map((r) => {
      const post = r.targetType === 'POST' ? postMap.get(r.targetId) : undefined;
      const answer = r.targetType === 'ANSWER' ? answerMap.get(r.targetId) : undefined;
      // Staff see who wrote it, anonymous or not (for moderation; never shown to members).
      const target = post
        ? {
            space: post.space,
            postId: post.id,
            title: post.title,
            body: post.body,
            status: post.status,
            authorUserId: post.authorUserId,
            authorName: names.get(post.authorUserId) ?? null,
            isAnonymous: post.isAnonymous,
          }
        : answer
          ? {
              space: answer.post.space,
              postId: answer.postId,
              title: answer.post.title,
              body: answer.body,
              status: answer.status,
              authorUserId: answer.authorUserId,
              authorName: names.get(answer.authorUserId) ?? null,
              isAnonymous: answer.isAnonymous,
            }
          : null;
      return {
        id: r.id,
        targetType: r.targetType,
        targetId: r.targetId,
        target,
        reason: r.reason,
        note: r.note,
        status: r.status,
        reportCount: counts.find((c) => c.targetType === r.targetType && c.targetId === r.targetId)?._count._all ?? 1,
        reporterName: reporters.get(r.reporterUserId) ?? null,
        resolvedByName: r.resolvedByUserId ? (staff.get(r.resolvedByUserId) ?? null) : null,
        createdAt: r.createdAt.toISOString(),
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
      };
    });
  }
}
