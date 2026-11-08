import { Injectable, Logger } from '@nestjs/common';
import {
  dhakaTimeOfDay,
  isWithinDailyWindow,
} from '../../common/time/dhaka-time.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type {
  NotificationChannel,
  NotificationStatus,
  Prisma,
} from '../../generated/prisma/client.js';
import type { NotificationPreferencesResponse } from '../../shared-contracts/notifications.contract.js';
import { UserContactPointsService } from '../auth/user-contact-points.service.js';
import { NotificationPreferencesService } from './notification-preferences.service.js';
import { DeliveryFailure } from './notifications-error-codes.js';
import { PushSender, type PushMessage } from './push/push-sender.js';
import { SmsSender } from './sms/sms-sender.js';

/** Text used instead of the real one for sensitive notifications (CLAUDE.md §4). */
const SENSITIVE_TITLE = 'দৈনিক স্বাস্থ্য';
const SENSITIVE_BODY = 'আপনার একটি রিমাইন্ডার আছে।';

export interface OutgoingNotification {
  userId: string;
  /** Whose care this is about. */
  patientId?: string | null;
  /** "dose.missed", "medicine.refill" */
  type: string;
  title: string;
  body: string;
  /** Shorter text for SMS (defaults to the body). */
  smsText?: string;
  /** Deep link for the app. */
  data?: Record<string, string>;
  channels: NotificationChannel[];
  /** Health details never go into push/SMS text (women's health, sensitive categories). */
  sensitive?: boolean;
  /** Rings even in the user's quiet hours (missed dose of a patient). */
  urgent?: boolean;
}

interface NotificationRow {
  userId: string;
  patientId: string | null;
  reminderId: string | null;
  channel: NotificationChannel;
  type: string;
  title: string;
  body: string;
  data: Prisma.InputJsonValue | undefined;
  status: NotificationStatus;
  failureReason: string | null;
  providerMsgId: string | null;
  sentAt: Date | null;
}

/**
 * Sends notifications over push, SMS and the in-app inbox, honouring each
 * user's preferences, and records every attempt as a Notification row.
 * Never logs recipients or message text.
 */
@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly preferences: NotificationPreferencesService,
    private readonly contactPoints: UserContactPointsService,
    private readonly push: PushSender,
    private readonly sms: SmsSender,
  ) {}

  async deliver(
    notifications: OutgoingNotification[],
    reminderId: string | null = null,
  ): Promise<void> {
    if (notifications.length === 0) return;

    const userIds = [...new Set(notifications.map((n) => n.userId))];
    const [prefs, pushTokens, phones] = await Promise.all([
      this.preferences.getMany(userIds),
      this.contactPoints.pushTokensByUser(userIds),
      this.contactPoints.smsPhonesByUser(userIds),
    ]);
    const nowTime = dhakaTimeOfDay(new Date());

    const rows: NotificationRow[] = [];
    const pushJobs: { rowIndex: number; tokens: string[] }[] = [];
    const pushMessages: PushMessage[] = [];

    for (const notification of notifications) {
      const pref = prefs.get(notification.userId)!;
      const base = {
        userId: notification.userId,
        patientId: notification.patientId ?? null,
        reminderId,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        data: notification.data,
        providerMsgId: null,
      };
      const outsideText = notification.sensitive
        ? { title: SENSITIVE_TITLE, body: SENSITIVE_BODY }
        : { title: notification.title, body: notification.body };

      for (const channel of new Set(notification.channels)) {
        if (channel === 'IN_APP') {
          rows.push({
            ...base,
            channel,
            status: 'SENT',
            failureReason: null,
            sentAt: new Date(),
          });
          continue;
        }

        if (channel === 'PUSH') {
          const tokens = pushTokens.get(notification.userId) ?? [];
          const failure = !pref.pushEnabled
            ? DeliveryFailure.PUSH_DISABLED
            : tokens.length === 0
              ? DeliveryFailure.NO_PUSH_TOKEN
              : null;
          rows.push({
            ...base,
            ...outsideText,
            channel,
            status: failure ? 'FAILED' : 'QUEUED',
            failureReason: failure,
            sentAt: null,
          });
          if (!failure) {
            pushJobs.push({ rowIndex: rows.length - 1, tokens });
            const withSound =
              Boolean(notification.urgent) || !inQuietHours(pref, nowTime);
            for (const token of tokens) {
              pushMessages.push({
                token,
                ...outsideText,
                data: notification.data,
                withSound,
              });
            }
          }
          continue;
        }

        // SMS
        const phone = phones.get(notification.userId);
        const smsText = notification.sensitive
          ? `${SENSITIVE_TITLE}: ${SENSITIVE_BODY}`
          : (notification.smsText ?? notification.body);
        let status: NotificationStatus = 'FAILED';
        let failureReason: string | null = null;
        let providerMsgId: string | null = null;
        if (!pref.smsEnabled) {
          failureReason = DeliveryFailure.SMS_DISABLED;
        } else if (!phone) {
          failureReason = DeliveryFailure.NO_PHONE;
        } else {
          const result = await this.sms.send(phone, smsText);
          if (result.ok) {
            status = 'SENT';
            providerMsgId = result.providerMsgId;
          } else {
            failureReason = result.reason;
          }
        }
        rows.push({
          ...base,
          title: outsideText.title,
          body: smsText,
          channel,
          status,
          failureReason,
          providerMsgId,
          sentAt: status === 'SENT' ? new Date() : null,
        });
      }
    }

    await this.sendPushes(rows, pushJobs, pushMessages);

    await this.prisma.notification.createMany({
      data: rows.map((row) => ({ ...row, data: row.data ?? undefined })),
    });
  }

  private async sendPushes(
    rows: NotificationRow[],
    jobs: { rowIndex: number; tokens: string[] }[],
    messages: PushMessage[],
  ): Promise<void> {
    if (messages.length === 0) return;
    const results = await this.push.send(messages);

    const goneTokens: string[] = [];
    let cursor = 0;
    for (const job of jobs) {
      const own = results.slice(cursor, cursor + job.tokens.length);
      job.tokens.forEach((token, index) => {
        const result = own[index];
        if (result && !result.ok && result.tokenGone) goneTokens.push(token);
      });
      cursor += job.tokens.length;

      const row = rows[job.rowIndex]!;
      const success = own.find((result) => result.ok);
      if (success?.ok) {
        row.status = 'SENT';
        row.providerMsgId = success.providerMsgId;
        row.sentAt = new Date();
      } else {
        row.status = 'FAILED';
        const failed = own.find((result) => !result.ok);
        row.failureReason =
          failed && !failed.ok ? failed.reason : 'PUSH_FAILED';
      }
    }

    if (goneTokens.length > 0) {
      this.logger.log(`Removing ${goneTokens.length} expired push token(s)`);
      await this.contactPoints.removePushTokens(goneTokens);
    }
  }
}

function inQuietHours(
  pref: NotificationPreferencesResponse,
  nowTime: string,
): boolean {
  return Boolean(
    pref.quietStart &&
    pref.quietEnd &&
    isWithinDailyWindow(nowTime, pref.quietStart, pref.quietEnd),
  );
}
