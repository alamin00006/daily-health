import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  RegisteredUsersOnly,
} from '../../common/auth/auth-route.decorators.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { UuidParam } from '../../common/pipes/uuid-param.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiZodBody } from '../../common/swagger/api-zod-body.decorator.js';
import {
  paginationQuerySchema,
  type PaginatedResponse,
  type PaginationQuery,
} from '../../shared-contracts/common-fields.contract.js';
import {
  updateNotificationPreferencesRequestSchema,
  type NotificationPreferencesResponse,
  type NotificationResponse,
  type UnreadCountResponse,
  type UpdateNotificationPreferencesRequest,
} from '../../shared-contracts/notifications.contract.js';
import { NotificationInboxService } from './notification-inbox.service.js';
import { NotificationPreferencesService } from './notification-preferences.service.js';

@ApiTags('notifications')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('me')
export class NotificationsController {
  constructor(
    private readonly inbox: NotificationInboxService,
    private readonly preferences: NotificationPreferencesService,
  ) {}

  @Get('notifications')
  @ApiOperation({ summary: 'My in-app notifications, newest first' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ): Promise<PaginatedResponse<NotificationResponse>> {
    return this.inbox.list(user.userId, query);
  }

  @Get('notifications/unread-count')
  @ApiOperation({ summary: 'Number for the bell badge' })
  unreadCount(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UnreadCountResponse> {
    return this.inbox.unreadCount(user.userId);
  }

  @Post('notifications/read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark every notification read' })
  readAll(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.inbox.markAllRead(user.userId);
  }

  @Post('notifications/:notificationId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark one notification read' })
  read(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('notificationId') notificationId: string,
  ): Promise<void> {
    return this.inbox.markRead(user.userId, notificationId);
  }

  @Get('notification-preferences')
  @ApiOperation({
    summary: 'Push / SMS / alarm settings (defaults until changed)',
  })
  getPreferences(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NotificationPreferencesResponse> {
    return this.preferences.get(user.userId);
  }

  @Patch('notification-preferences')
  @ApiOperation({ summary: 'Change any of the settings' })
  @ApiZodBody(updateNotificationPreferencesRequestSchema)
  updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateNotificationPreferencesRequestSchema))
    body: UpdateNotificationPreferencesRequest,
  ): Promise<NotificationPreferencesResponse> {
    return this.preferences.update(user.userId, body);
  }
}
