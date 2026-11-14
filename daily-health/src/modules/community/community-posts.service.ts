import { randomInt } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { AppException } from '../../common/errors/app-exception.js';
import { toBanglaDigits } from '../../common/formatting/bangla-digits.js';
import { afterCursor, toKeysetPage } from '../../common/pagination/keyset-cursor.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { StoredUploadsService } from '../../core/uploads/stored-uploads.service.js';
import { UploadedFileProcessorService } from '../../core/uploads/uploaded-file-processor.service.js';
import { Prisma, type Answer, type ForumCategory, type Post, type PostImage } from '../../generated/prisma/client.js';
import type { PaginatedResponse, PaginationQuery } from '../../shared-contracts/common-fields.contract.js';
import {
  MAX_POST_IMAGES,
  type AnswerResponse,
  type CommunityAuthor,
  type CreateAnswerRequest,
  type CreatePostRequest,
  type CreateReportRequest,
  type ForumCategoryResponse,
  type LikeResponse,
  type ListPostsQuery,
  type PostResponse,
  type PostSummaryResponse,
  type SetLikeRequest,
} from '../../shared-contracts/community.contract.js';
import { ProviderDirectoryService } from '../doctors/provider-directory.service.js';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service.js';
import { PatientProfilesService } from '../users/patient-profiles.service.js';
import { CommunityAccessService } from './community-access.service.js';
import { CommunityErrorCode } from './community-error-codes.js';

const IMAGE_MIME = 'image/webp';
const EXCERPT_LENGTH = 220;

type PostWithCategory = Post & { category: ForumCategory; images?: PostImage[] };
type Authored = { authorUserId: string; providerId: string | null; isAnonymous: boolean; anonAlias: string | null };

/** Posts, answers, likes and reports, as members see them. */
@Injectable()
export class CommunityPostsService {
  private readonly logger = new Logger(CommunityPostsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CommunityAccessService,
    private readonly profiles: PatientProfilesService,
    private readonly providers: ProviderDirectoryService,
    private readonly uploads: StoredUploadsService,
    private readonly processor: UploadedFileProcessorService,
    private readonly delivery: NotificationDeliveryService,
  ) {}

  // -------------------------------------------------------------------------
  // Categories
  // -------------------------------------------------------------------------

  async categories(user: AuthenticatedUser | null): Promise<ForumCategoryResponse[]> {
    const spaces = await this.access.readableSpaces(user);
    const rows = await this.prisma.forumCategory.findMany({
      where: { isActive: true },
      orderBy: [{ space: 'asc' }, { sortOrder: 'asc' }],
      include: { _count: { select: { posts: { where: { status: 'PUBLISHED' } } } } },
    });
    // The women's categories are listed (so the app can show the closed space),
    // but their post counts only to those who can read them.
    return rows.map((c) => ({
      id: c.id,
      slug: c.slug,
      nameBn: c.nameBn,
      space: c.space,
      isSensitive: c.isSensitive,
      postCount: spaces.includes(c.space) ? c._count.posts : 0,
    }));
  }

  // -------------------------------------------------------------------------
  // Posts
  // -------------------------------------------------------------------------

  async list(user: AuthenticatedUser | null, query: ListPostsQuery): Promise<PaginatedResponse<PostSummaryResponse>> {
    await this.access.assertCanRead(user, query.space);
    const mine = Boolean(query.mine && user);
    const where: Prisma.PostWhereInput = {
      space: query.space,
      ...(mine ? { authorUserId: user!.userId, status: { in: ['PUBLISHED', 'HIDDEN'] } } : { status: 'PUBLISHED' }),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.answeredByDoctor ? { doctorAnswerCount: { gt: 0 } } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { body: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...afterCursor('createdAt', query.cursor),
    };
    const rows = await this.prisma.post.findMany({
      where,
      include: { category: true, _count: { select: { images: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = toKeysetPage(rows, query.limit, (r) => r.createdAt, (r) => r);
    const [authors, liked] = await Promise.all([
      this.authors(page.data, user),
      this.likedSet(user, 'POST', page.data.map((p) => p.id)),
    ]);
    return {
      data: page.data.map((p) => ({
        ...this.postBase(p, authors.get(p.id)!, liked.has(p.id)),
        excerpt: p.body.length > EXCERPT_LENGTH ? `${p.body.slice(0, EXCERPT_LENGTH).trimEnd()}…` : p.body,
        imageCount: p._count.images,
      })),
      meta: page.meta,
    };
  }

  async get(user: AuthenticatedUser | null, postId: string): Promise<PostResponse> {
    const post = await this.requireReadable(user, postId);
    const [authors, liked] = await Promise.all([this.authors([post], user), this.likedSet(user, 'POST', [post.id])]);
    const images = post.images ?? [];
    return {
      ...this.postBase(post, authors.get(post.id)!, liked.has(post.id)),
      body: post.body,
      status: post.status,
      imageCount: images.length,
      images: images.map((img) => ({
        id: img.id,
        url: this.uploads.thumbnailUrl(img.storageKey, 800),
        thumbnailUrl: this.uploads.thumbnailUrl(img.storageKey, 200),
      })),
    };
  }

  async create(user: AuthenticatedUser, input: CreatePostRequest): Promise<PostResponse> {
    const category = await this.prisma.forumCategory.findFirst({ where: { id: input.categoryId, isActive: true } });
    if (!category) throw notFound(CommunityErrorCode.FORUM_CATEGORY_NOT_FOUND, 'Category not found');
    await this.access.assertCanWrite(user, category.space);
    const provider = await this.providers.findVerifiedByUserId(user.userId);
    const post = await this.prisma.post.create({
      data: {
        authorUserId: user.userId,
        // A provider posting anonymously is not shown as one.
        providerId: input.isAnonymous ? null : (provider?.id ?? null),
        categoryId: category.id,
        space: category.space,
        title: input.title,
        body: input.body,
        isAnonymous: input.isAnonymous,
        anonAlias: input.isAnonymous ? anonAlias() : null,
      },
    });
    return this.get(user, post.id);
  }

  /** Authors remove their own post (kept for moderation history). */
  async remove(user: AuthenticatedUser, postId: string): Promise<void> {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.status === 'REMOVED' || post.authorUserId !== user.userId) {
      throw notFound(CommunityErrorCode.POST_NOT_FOUND, 'Post not found');
    }
    await this.prisma.post.update({ where: { id: postId }, data: { status: 'REMOVED' } });
  }

  async addImage(user: AuthenticatedUser, postId: string, file: Buffer): Promise<PostResponse> {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, include: { _count: { select: { images: true } } } });
    if (!post || post.status === 'REMOVED' || post.authorUserId !== user.userId) {
      throw notFound(CommunityErrorCode.POST_NOT_FOUND, 'Post not found');
    }
    if (post._count.images >= MAX_POST_IMAGES) {
      throw new AppException(CommunityErrorCode.POST_IMAGE_LIMIT, `At most ${MAX_POST_IMAGES} pictures`, HttpStatus.CONFLICT);
    }
    const processed = await this.processor.process(file, { allowPdf: false });
    const storageKey = await this.uploads.store(processed, 'private');
    try {
      await this.prisma.postImage.create({ data: { postId, storageKey, sortOrder: post._count.images } });
    } catch (error) {
      await this.uploads.remove(storageKey, processed.mimeType);
      throw error;
    }
    return this.get(user, postId);
  }

  async removeImage(user: AuthenticatedUser, postId: string, imageId: string): Promise<PostResponse> {
    const image = await this.prisma.postImage.findFirst({ where: { id: imageId, postId, post: { authorUserId: user.userId } } });
    if (!image) throw notFound(CommunityErrorCode.POST_NOT_FOUND, 'Picture not found');
    await this.prisma.postImage.delete({ where: { id: image.id } });
    await this.uploads.remove(image.storageKey, IMAGE_MIME);
    return this.get(user, postId);
  }

  // -------------------------------------------------------------------------
  // Answers
  // -------------------------------------------------------------------------

  async answers(user: AuthenticatedUser | null, postId: string, query: PaginationQuery): Promise<PaginatedResponse<AnswerResponse>> {
    await this.requireReadable(user, postId);
    // Highlighted and doctors' answers first, then the oldest first (a conversation).
    const rows = await this.prisma.answer.findMany({
      where: { postId, status: 'PUBLISHED', ...afterCursor('createdAt', query.cursor) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
    });
    const page = toKeysetPage(rows, query.limit, (r) => r.createdAt, (r) => r);
    const [authors, liked] = await Promise.all([
      this.authors(page.data, user),
      this.likedSet(user, 'ANSWER', page.data.map((a) => a.id)),
    ]);
    const data = page.data
      .map((a) => this.answerView(a, authors.get(a.id)!, liked.has(a.id)))
      .sort((a, b) => Number(b.isHighlighted) - Number(a.isHighlighted) || Number(Boolean(b.author.provider)) - Number(Boolean(a.author.provider)));
    return { data, meta: page.meta };
  }

  async answer(user: AuthenticatedUser, postId: string, input: CreateAnswerRequest): Promise<AnswerResponse> {
    const post = await this.requireReadable(user, postId);
    if (post.status !== 'PUBLISHED') {
      throw new AppException(CommunityErrorCode.POST_CLOSED, 'This post is closed', HttpStatus.CONFLICT);
    }
    await this.access.assertCanWrite(user, post.space);
    const provider = input.isAnonymous ? null : await this.providers.findVerifiedByUserId(user.userId);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.answer.create({
        data: {
          postId,
          authorUserId: user.userId,
          providerId: provider?.id ?? null,
          body: input.body,
          isAnonymous: input.isAnonymous,
          anonAlias: input.isAnonymous ? anonAlias() : null,
        },
      });
      await tx.post.update({
        where: { id: postId },
        data: {
          answerCount: { increment: 1 },
          ...(provider ? { doctorAnswerCount: { increment: 1 } } : {}),
        },
      });
      return created;
    });
    if (post.authorUserId !== user.userId) await this.notifyAnswer(post, Boolean(provider));
    const authors = await this.authors([row], user);
    return this.answerView(row, authors.get(row.id)!, false);
  }

  async removeAnswer(user: AuthenticatedUser, answerId: string): Promise<void> {
    const answer = await this.prisma.answer.findUnique({ where: { id: answerId } });
    if (!answer || answer.status === 'REMOVED' || answer.authorUserId !== user.userId) {
      throw notFound(CommunityErrorCode.ANSWER_NOT_FOUND, 'Answer not found');
    }
    await this.setAnswerStatus(answer, 'REMOVED');
  }

  /** Keeps the post's counters right when an answer leaves or comes back. */
  async setAnswerStatus(answer: Answer, status: 'PUBLISHED' | 'HIDDEN' | 'REMOVED', note?: string | null): Promise<void> {
    const wasCounted = answer.status === 'PUBLISHED';
    const willCount = status === 'PUBLISHED';
    await this.prisma.$transaction(async (tx) => {
      await tx.answer.update({ where: { id: answer.id }, data: { status, moderationNote: note ?? null } });
      if (wasCounted !== willCount) {
        const step = willCount ? 1 : -1;
        await tx.post.update({
          where: { id: answer.postId },
          data: {
            answerCount: { increment: step },
            ...(answer.providerId ? { doctorAnswerCount: { increment: step } } : {}),
          },
        });
      }
    });
  }

  // -------------------------------------------------------------------------
  // Likes and reports
  // -------------------------------------------------------------------------

  async setLike(user: AuthenticatedUser, input: SetLikeRequest): Promise<LikeResponse> {
    const space = await this.targetSpace(input.targetType, input.targetId);
    await this.access.assertCanRead(user, space);
    return this.prisma.$transaction(async (tx) => {
      const key = { userId: user.userId, targetType: input.targetType, targetId: input.targetId };
      const exists = await tx.reaction.findUnique({ where: { userId_targetType_targetId: key } });
      let step = 0;
      if (input.liked && !exists) {
        await tx.reaction.create({ data: key });
        step = 1;
      } else if (!input.liked && exists) {
        await tx.reaction.delete({ where: { userId_targetType_targetId: key } });
        step = -1;
      }
      const updated =
        input.targetType === 'POST'
          ? await tx.post.update({ where: { id: input.targetId }, data: { likeCount: { increment: step } } })
          : await tx.answer.update({ where: { id: input.targetId }, data: { likeCount: { increment: step } } });
      return { liked: input.liked, likeCount: updated.likeCount };
    });
  }

  async report(user: AuthenticatedUser, input: CreateReportRequest): Promise<void> {
    const space = await this.targetSpace(input.targetType, input.targetId);
    await this.access.assertCanRead(user, space);
    try {
      await this.prisma.contentReport.create({
        data: {
          reporterUserId: user.userId,
          targetType: input.targetType,
          targetId: input.targetId,
          reason: input.reason,
          note: input.note ?? null,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(CommunityErrorCode.ALREADY_REPORTED, 'Already reported', HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Shared with moderation
  // -------------------------------------------------------------------------

  /** Names shown for a set of posts or answers (by row id). */
  async authors(rows: (Authored & { id: string })[], viewer: AuthenticatedUser | null): Promise<Map<string, CommunityAuthor>> {
    const named = rows.filter((r) => !r.isAnonymous);
    const [names, providers] = await Promise.all([
      this.profiles.ownNamesByUserIds(named.filter((r) => !r.providerId).map((r) => r.authorUserId)),
      this.providers.summariesByIds(named.flatMap((r) => (r.providerId ? [r.providerId] : []))),
    ]);
    return new Map(
      rows.map((r) => {
        const provider = r.providerId ? providers.get(r.providerId) : undefined;
        const displayName = r.isAnonymous
          ? (r.anonAlias ?? 'বেনামী সদস্য')
          : provider
            ? provider.type === 'DOCTOR'
              ? `ডা. ${provider.displayName}`
              : provider.displayName
            : (names.get(r.authorUserId) ?? 'সদস্য');
        return [
          r.id,
          {
            displayName,
            isAnonymous: r.isAnonymous,
            provider: provider ? { id: provider.id, type: provider.type, designation: provider.designation } : null,
            isMe: viewer?.userId === r.authorUserId,
          },
        ];
      }),
    );
  }

  async targetSpace(targetType: 'POST' | 'ANSWER', targetId: string) {
    if (targetType === 'POST') {
      const post = await this.prisma.post.findFirst({ where: { id: targetId, status: 'PUBLISHED' } });
      if (!post) throw notFound(CommunityErrorCode.POST_NOT_FOUND, 'Post not found');
      return post.space;
    }
    const answer = await this.prisma.answer.findFirst({
      where: { id: targetId, status: 'PUBLISHED' },
      include: { post: { select: { space: true } } },
    });
    if (!answer) throw notFound(CommunityErrorCode.ANSWER_NOT_FOUND, 'Answer not found');
    return answer.post.space;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Published posts for readers of the space; the author also sees their hidden post. */
  private async requireReadable(user: AuthenticatedUser | null, postId: string): Promise<PostWithCategory> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: { category: true, images: { orderBy: { sortOrder: 'asc' } } },
    });
    const visible =
      post &&
      (post.status === 'PUBLISHED' ||
        (post.status === 'HIDDEN' && (post.authorUserId === user?.userId || this.access.isStaff(user))));
    if (!post || !visible) throw notFound(CommunityErrorCode.POST_NOT_FOUND, 'Post not found');
    await this.access.assertCanRead(user, post.space);
    return post;
  }

  private async likedSet(user: AuthenticatedUser | null, targetType: 'POST' | 'ANSWER', ids: string[]): Promise<Set<string>> {
    if (!user || ids.length === 0) return new Set();
    const rows = await this.prisma.reaction.findMany({
      where: { userId: user.userId, targetType, targetId: { in: ids } },
      select: { targetId: true },
    });
    return new Set(rows.map((r) => r.targetId));
  }

  private postBase(p: PostWithCategory, author: CommunityAuthor, likedByMe: boolean) {
    return {
      id: p.id,
      space: p.space,
      category: { id: p.category.id, slug: p.category.slug, nameBn: p.category.nameBn, isSensitive: p.category.isSensitive },
      title: p.title,
      author,
      answerCount: p.answerCount,
      doctorAnswerCount: p.doctorAnswerCount,
      likeCount: p.likeCount,
      likedByMe,
      imageCount: 0,
      createdAt: p.createdAt.toISOString(),
    };
  }

  private answerView(a: Answer, author: CommunityAuthor, likedByMe: boolean): AnswerResponse {
    return {
      id: a.id,
      postId: a.postId,
      body: a.body,
      author,
      likeCount: a.likeCount,
      likedByMe,
      isHighlighted: a.isHighlighted,
      createdAt: a.createdAt.toISOString(),
    };
  }

  /** Tell the asker; the women's space and sensitive topics never carry text outside the app. */
  private async notifyAnswer(post: PostWithCategory, byDoctor: boolean): Promise<void> {
    const sensitive = post.space === 'WOMEN' || post.category.isSensitive;
    try {
      await this.delivery.deliver([
        {
          userId: post.authorUserId,
          type: 'community.answer',
          title: byDoctor ? 'আপনার প্রশ্নে ডাক্তারের উত্তর এসেছে' : 'আপনার প্রশ্নে নতুন উত্তর',
          body: sensitive ? 'অ্যাপে খুলে দেখুন' : post.title,
          data: { screen: 'community-post', postId: post.id },
          channels: ['PUSH', 'IN_APP'],
          sensitive,
        },
      ]);
    } catch (error) {
      this.logger.warn(`Answer notification failed: ${(error as Error).message}`);
    }
  }
}

function anonAlias(): string {
  return `বেনামী সদস্য ${toBanglaDigits(String(randomInt(1000, 10000)))}`;
}

function notFound(code: string, message: string): AppException {
  return new AppException(code, message, HttpStatus.NOT_FOUND);
}
