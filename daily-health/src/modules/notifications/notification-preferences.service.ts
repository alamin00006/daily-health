import { Injectable } from '@nestjs/common';
import {
  hhmmToTimeColumn,
  timeColumnToHhmm,
} from '../../common/time/dhaka-time.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { NotificationPreference } from '../../generated/prisma/client.js';
import type {
  NotificationPreferencesResponse,
  UpdateNotificationPreferencesRequest,
} from '../../shared-contracts/notifications.contract.js';

/** Used until the user changes anything (no row is stored for defaults). */
export const DEFAULT_PREFERENCES: NotificationPreferencesResponse = {
  pushEnabled: true,
  smsEnabled: true,
  alarmEnabled: true,
  doseBackupDelayMin: 30,
  followUpOffsetsMin: [1440, 120],
  quietStart: null,
  quietEnd: null,
};

@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<NotificationPreferencesResponse> {
    const row = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
    return row ? toResponse(row) : { ...DEFAULT_PREFERENCES };
  }

  async getMany(
    userIds: string[],
  ): Promise<Map<string, NotificationPreferencesResponse>> {
    const rows =
      userIds.length === 0
        ? []
        : await this.prisma.notificationPreference.findMany({
            where: { userId: { in: userIds } },
          });
    const byUser = new Map(rows.map((row) => [row.userId, toResponse(row)]));
    return new Map(
      userIds.map((id) => [id, byUser.get(id) ?? { ...DEFAULT_PREFERENCES }]),
    );
  }

  async update(
    userId: string,
    input: UpdateNotificationPreferencesRequest,
  ): Promise<NotificationPreferencesResponse> {
    const data = {
      ...(input.pushEnabled !== undefined
        ? { pushEnabled: input.pushEnabled }
        : {}),
      ...(input.smsEnabled !== undefined
        ? { smsEnabled: input.smsEnabled }
        : {}),
      ...(input.alarmEnabled !== undefined
        ? { alarmEnabled: input.alarmEnabled }
        : {}),
      ...(input.doseBackupDelayMin !== undefined
        ? { doseBackupDelayMin: input.doseBackupDelayMin }
        : {}),
      ...(input.followUpOffsetsMin !== undefined
        ? {
            followUpOffsetsMin: [...input.followUpOffsetsMin].sort(
              (a, b) => b - a,
            ),
          }
        : {}),
      ...(input.quietStart !== undefined
        ? {
            quietStart: input.quietStart
              ? hhmmToTimeColumn(input.quietStart)
              : null,
          }
        : {}),
      ...(input.quietEnd !== undefined
        ? { quietEnd: input.quietEnd ? hhmmToTimeColumn(input.quietEnd) : null }
        : {}),
    };
    const row = await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return toResponse(row);
  }
}

function toResponse(
  row: NotificationPreference,
): NotificationPreferencesResponse {
  const offsets = Array.isArray(row.followUpOffsetsMin)
    ? row.followUpOffsetsMin.filter(
        (value): value is number => typeof value === 'number',
      )
    : DEFAULT_PREFERENCES.followUpOffsetsMin;
  return {
    pushEnabled: row.pushEnabled,
    smsEnabled: row.smsEnabled,
    alarmEnabled: row.alarmEnabled,
    doseBackupDelayMin: row.doseBackupDelayMin,
    followUpOffsetsMin: offsets,
    quietStart: row.quietStart ? timeColumnToHhmm(row.quietStart) : null,
    quietEnd: row.quietEnd ? timeColumnToHhmm(row.quietEnd) : null,
  };
}
