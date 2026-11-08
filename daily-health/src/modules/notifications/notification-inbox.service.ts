import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception.js';
import {
  afterCursor,
  toKeysetPage,
} from '../../common/pagination/keyset-cursor.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { Notification } from '../../generated/prisma/client.js';
import type {
  PaginatedResponse,
  PaginationQuery,
} from '../../shared-contracts/common-fields.contract.js';
import type {
  NotificationResponse,
  UnreadCountResponse,
} from '../../shared-contracts/notifications.contract.js';
import { NotificationsErrorCode } from './notifications-error-codes.js';

/** The bell icon: the user's IN_APP notifications, newest first. */
@Injectable()
export class NotificationInboxService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    query: PaginationQuery,
  ): Promise<PaginatedResponse<NotificationResponse>> {
    const rows = await this.prisma.notification.findMany({
      where: {
        userId,
        channel: 'IN_APP',
        ...afterCursor('createdAt', query.cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    return toKeysetPage(rows, query.limit, (row) => row.createdAt, toResponse);
  }

  async unreadCount(userId: string): Promise<UnreadCountResponse> {
    const unread = await this.prisma.notification.count({
      where: { userId, channel: 'IN_APP', readAt: null },
    });
    return { unread };
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    const { count } = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId, channel: 'IN_APP' },
      data: { readAt: new Date() },
    });
    if (count === 0) {
      throw new AppException(
        NotificationsErrorCode.NOTIFICATION_NOT_FOUND,
        'Notification not found',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, channel: 'IN_APP', readAt: null },
      data: { readAt: new Date() },
    });
  }
}

function toResponse(row: Notification): NotificationResponse {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    data:
      row.data && typeof row.data === 'object' && !Array.isArray(row.data)
        ? (row.data as Record<string, unknown>)
        : null,
    patientId: row.patientId,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
