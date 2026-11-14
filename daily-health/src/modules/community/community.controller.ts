import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  IdentifyCallerIfLoggedIn,
  OptionalCurrentUser,
  PublicRoute,
  RegisteredUsersOnly,
} from '../../common/auth/auth-route.decorators.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { StaffOnly } from '../../common/auth/staff-role.guard.js';
import { UuidParam } from '../../common/pipes/uuid-param.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiZodBody } from '../../common/swagger/api-zod-body.decorator.js';
import {
  requireUploadedFile,
  SingleFileUpload,
  type UploadedMultipartFile,
} from '../../core/uploads/single-file-upload.decorator.js';
import {
  paginationQuerySchema,
  type PaginatedResponse,
  type PaginationQuery,
} from '../../shared-contracts/common-fields.contract.js';
import {
  banScopeSchema,
  createAnswerRequestSchema,
  createBanRequestSchema,
  createPostRequestSchema,
  createReportRequestSchema,
  decideMembershipRequestSchema,
  listAnswersQuerySchema,
  listMembershipsQuerySchema,
  listPostsQuerySchema,
  listReportsQuerySchema,
  moderationNoteSchema,
  resolveReportRequestSchema,
  setLikeRequestSchema,
  womenJoinRequestSchema,
  type AnswerResponse,
  type BanScope,
  type CommunityAccessResponse,
  type CommunityBanResponse,
  type CommunityStaffCountsResponse,
  type CreateAnswerRequest,
  type CreateBanRequest,
  type CreatePostRequest,
  type CreateReportRequest,
  type DecideMembershipRequest,
  type ForumCategoryResponse,
  type LikeResponse,
  type ListMembershipsQuery,
  type ListPostsQuery,
  type ListReportsQuery,
  type ModerationNote,
  type PostResponse,
  type PostSummaryResponse,
  type ResolveReportRequest,
  type SetLikeRequest,
  type StaffReportResponse,
  type WomenJoinRequest,
  type WomenMembershipResponse,
} from '../../shared-contracts/community.contract.js';
import { CommunityAccessService } from './community-access.service.js';
import { CommunityModerationService } from './community-moderation.service.js';
import { CommunityPostsService } from './community-posts.service.js';

/** Reading: guests read the common space; members also the women's space. */
@ApiTags('community')
@PublicRoute()
@IdentifyCallerIfLoggedIn()
@Controller('community')
export class CommunityReadController {
  constructor(
    private readonly posts: CommunityPostsService,
    private readonly access: CommunityAccessService,
  ) {}

  @Get('access')
  @ApiOperation({ summary: 'Can I post; my women community membership' })
  myAccess(@OptionalCurrentUser() user: AuthenticatedUser | null): Promise<CommunityAccessResponse> {
    return this.access.access(user);
  }

  @Get('categories')
  categories(@OptionalCurrentUser() user: AuthenticatedUser | null): Promise<ForumCategoryResponse[]> {
    return this.posts.categories(user);
  }

  @Get('posts')
  @ApiOperation({ summary: 'Posts of a space, newest first (search, category, mine, doctor-answered)' })
  list(
    @OptionalCurrentUser() user: AuthenticatedUser | null,
    @Query(new ZodValidationPipe(listPostsQuerySchema)) query: ListPostsQuery,
  ): Promise<PaginatedResponse<PostSummaryResponse>> {
    return this.posts.list(user, query);
  }

  @Get('posts/:postId')
  get(@OptionalCurrentUser() user: AuthenticatedUser | null, @UuidParam('postId') postId: string): Promise<PostResponse> {
    return this.posts.get(user, postId);
  }

  @Get('posts/:postId/answers')
  @ApiOperation({ summary: 'Answers: highlighted and doctors first, then oldest first' })
  answers(
    @OptionalCurrentUser() user: AuthenticatedUser | null,
    @UuidParam('postId') postId: string,
    @Query(new ZodValidationPipe(listAnswersQuerySchema)) query: PaginationQuery,
  ): Promise<PaginatedResponse<AnswerResponse>> {
    return this.posts.answers(user, postId, query);
  }
}

@ApiTags('community')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('community')
export class CommunityWriteController {
  constructor(
    private readonly posts: CommunityPostsService,
    private readonly access: CommunityAccessService,
  ) {}

  @Post('women/join-request')
  @ApiOperation({ summary: "Ask to join the women's community (own profile must be female)" })
  @ApiZodBody(womenJoinRequestSchema)
  joinWomen(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(womenJoinRequestSchema)) body: WomenJoinRequest,
  ): Promise<CommunityAccessResponse> {
    return this.access.requestWomenMembership(user, body.note);
  }

  @Post('posts')
  @ApiZodBody(createPostRequestSchema)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createPostRequestSchema)) body: CreatePostRequest,
  ): Promise<PostResponse> {
    return this.posts.create(user, body);
  }

  @Delete('posts/:postId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser, @UuidParam('postId') postId: string): Promise<void> {
    return this.posts.remove(user, postId);
  }

  @Put('posts/:postId/images')
  @SingleFileUpload()
  @ApiOperation({ summary: 'Add a picture (at most 3; private, signed links)' })
  addImage(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('postId') postId: string,
    @UploadedFile() file: UploadedMultipartFile | undefined,
  ): Promise<PostResponse> {
    return this.posts.addImage(user, postId, requireUploadedFile(file).buffer);
  }

  @Delete('posts/:postId/images/:imageId')
  removeImage(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('postId') postId: string,
    @UuidParam('imageId') imageId: string,
  ): Promise<PostResponse> {
    return this.posts.removeImage(user, postId, imageId);
  }

  @Post('posts/:postId/answers')
  @ApiOperation({ summary: 'Answer (a verified provider answer is marked as such)' })
  @ApiZodBody(createAnswerRequestSchema)
  answer(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('postId') postId: string,
    @Body(new ZodValidationPipe(createAnswerRequestSchema)) body: CreateAnswerRequest,
  ): Promise<AnswerResponse> {
    return this.posts.answer(user, postId, body);
  }

  @Delete('answers/:answerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAnswer(@CurrentUser() user: AuthenticatedUser, @UuidParam('answerId') answerId: string): Promise<void> {
    return this.posts.removeAnswer(user, answerId);
  }

  @Put('likes')
  @ApiZodBody(setLikeRequestSchema)
  like(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(setLikeRequestSchema)) body: SetLikeRequest,
  ): Promise<LikeResponse> {
    return this.posts.setLike(user, body);
  }

  @Post('reports')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiZodBody(createReportRequestSchema)
  report(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createReportRequestSchema)) body: CreateReportRequest,
  ): Promise<void> {
    return this.posts.report(user, body);
  }
}

/** Panel: MODERATOR and ADMIN keep both spaces healthy. */
@ApiTags('staff: community')
@ApiBearerAuth()
@StaffOnly()
@Controller('staff/community')
export class StaffCommunityController {
  constructor(private readonly moderation: CommunityModerationService) {}

  @Get('counts')
  counts(): Promise<CommunityStaffCountsResponse> {
    return this.moderation.counts();
  }

  @Get('reports')
  reports(
    @Query(new ZodValidationPipe(listReportsQuerySchema)) query: ListReportsQuery,
  ): Promise<PaginatedResponse<StaffReportResponse>> {
    return this.moderation.reports(query);
  }

  @Post('reports/:reportId/resolve')
  @ApiOperation({ summary: 'Hide, hide and ban, or dismiss (closes every open report on it)' })
  @ApiZodBody(resolveReportRequestSchema)
  resolve(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('reportId') reportId: string,
    @Body(new ZodValidationPipe(resolveReportRequestSchema)) body: ResolveReportRequest,
  ): Promise<StaffReportResponse> {
    return this.moderation.resolve(user.userId, reportId, body);
  }

  @Post('posts/:postId/hide')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiZodBody(moderationNoteSchema)
  hidePost(
    @UuidParam('postId') postId: string,
    @Body(new ZodValidationPipe(moderationNoteSchema)) body: ModerationNote,
  ): Promise<void> {
    return this.moderation.setPostHidden(postId, true, body.note);
  }

  @Post('posts/:postId/restore')
  @HttpCode(HttpStatus.NO_CONTENT)
  restorePost(@UuidParam('postId') postId: string): Promise<void> {
    return this.moderation.setPostHidden(postId, false);
  }

  @Post('answers/:answerId/hide')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiZodBody(moderationNoteSchema)
  hideAnswer(
    @UuidParam('answerId') answerId: string,
    @Body(new ZodValidationPipe(moderationNoteSchema)) body: ModerationNote,
  ): Promise<void> {
    return this.moderation.setAnswerHidden(answerId, true, body.note);
  }

  @Post('answers/:answerId/restore')
  @HttpCode(HttpStatus.NO_CONTENT)
  restoreAnswer(@UuidParam('answerId') answerId: string): Promise<void> {
    return this.moderation.setAnswerHidden(answerId, false);
  }

  @Post('answers/:answerId/highlight')
  @HttpCode(HttpStatus.NO_CONTENT)
  highlight(@UuidParam('answerId') answerId: string): Promise<void> {
    return this.moderation.setAnswerHighlighted(answerId, true);
  }

  @Post('answers/:answerId/unhighlight')
  @HttpCode(HttpStatus.NO_CONTENT)
  unhighlight(@UuidParam('answerId') answerId: string): Promise<void> {
    return this.moderation.setAnswerHighlighted(answerId, false);
  }

  @Get('women/members')
  @ApiOperation({ summary: "Join requests (PENDING) or members by status of the women's community" })
  memberships(
    @Query(new ZodValidationPipe(listMembershipsQuerySchema)) query: ListMembershipsQuery,
  ): Promise<PaginatedResponse<WomenMembershipResponse>> {
    return this.moderation.memberships(query);
  }

  @Post('women/:userId/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiZodBody(decideMembershipRequestSchema)
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('userId') userId: string,
    @Body(new ZodValidationPipe(decideMembershipRequestSchema)) body: DecideMembershipRequest,
  ): Promise<void> {
    return this.moderation.decide(user.userId, userId, 'approve', body.note);
  }

  @Post('women/:userId/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiZodBody(decideMembershipRequestSchema)
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('userId') userId: string,
    @Body(new ZodValidationPipe(decideMembershipRequestSchema)) body: DecideMembershipRequest,
  ): Promise<void> {
    return this.moderation.decide(user.userId, userId, 'reject', body.note);
  }

  @Post('women/:userId/remove')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiZodBody(decideMembershipRequestSchema)
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('userId') userId: string,
    @Body(new ZodValidationPipe(decideMembershipRequestSchema)) body: DecideMembershipRequest,
  ): Promise<void> {
    return this.moderation.decide(user.userId, userId, 'remove', body.note);
  }

  @Get('bans')
  bans(
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ): Promise<PaginatedResponse<CommunityBanResponse>> {
    return this.moderation.bans(query);
  }

  @Post('bans')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiZodBody(createBanRequestSchema)
  ban(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createBanRequestSchema)) body: CreateBanRequest,
  ): Promise<void> {
    return this.moderation.ban(user.userId, body);
  }

  @Delete('bans/:userId/:scope')
  @HttpCode(HttpStatus.NO_CONTENT)
  unban(
    @UuidParam('userId') userId: string,
    @Param('scope', new ZodValidationPipe(banScopeSchema)) scope: BanScope,
  ): Promise<void> {
    return this.moderation.unban(userId, scope);
  }
}
