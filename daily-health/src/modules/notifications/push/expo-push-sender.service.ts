import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../../core/config/app-config.service.js';
import {
  PushSender,
  type PushMessage,
  type PushResult,
} from './push-sender.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo accepts at most 100 messages per request. */
const BATCH_SIZE = 100;
const REQUEST_TIMEOUT_MS = 10_000;
const EXPO_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

/** Android notification channel the app creates for reminders (high importance). */
export const ANDROID_REMINDER_CHANNEL = 'reminders';

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Expo push service (works for both Android/FCM and iOS/APNs through one API).
 * Logs only error codes: never tokens, titles or bodies.
 */
@Injectable()
export class ExpoPushSenderService extends PushSender {
  private readonly logger = new Logger(ExpoPushSenderService.name);

  constructor(private readonly config: AppConfigService) {
    super();
  }

  async send(messages: PushMessage[]): Promise<PushResult[]> {
    const results: PushResult[] = [];
    for (let start = 0; start < messages.length; start += BATCH_SIZE) {
      results.push(
        ...(await this.sendBatch(messages.slice(start, start + BATCH_SIZE))),
      );
    }
    return results;
  }

  private async sendBatch(batch: PushMessage[]): Promise<PushResult[]> {
    const valid = batch.map((message) =>
      EXPO_TOKEN_PATTERN.test(message.token),
    );
    const payload = batch
      .filter((_, index) => valid[index])
      .map((message) => ({
        to: message.token,
        title: message.title,
        body: message.body,
        data: message.data ?? {},
        sound: message.withSound ? 'default' : null,
        priority: 'high',
        channelId: ANDROID_REMINDER_CHANNEL,
      }));

    let tickets: ExpoTicket[] = [];
    if (payload.length > 0) {
      try {
        tickets = await this.post(payload);
      } catch (error) {
        this.logger.warn(
          `Expo push request failed: ${(error as Error).message}`,
        );
        return batch.map(() => ({
          ok: false,
          reason: 'PUSH_SERVICE_UNAVAILABLE',
          tokenGone: false,
        }));
      }
    }

    let ticketIndex = 0;
    return batch.map((_, index): PushResult => {
      if (!valid[index]) {
        return { ok: false, reason: 'INVALID_PUSH_TOKEN', tokenGone: true };
      }
      const ticket = tickets[ticketIndex++];
      if (ticket?.status === 'ok' && ticket.id) {
        return { ok: true, providerMsgId: ticket.id };
      }
      const code = ticket?.details?.error ?? 'PUSH_REJECTED';
      return {
        ok: false,
        reason: code,
        tokenGone: code === 'DeviceNotRegistered',
      };
    });
  }

  private async post(payload: unknown[]): Promise<ExpoTicket[]> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    const accessToken = this.config.expoPushAccessToken;
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = (await response.json()) as { data?: ExpoTicket[] };
    return body.data ?? [];
  }
}
