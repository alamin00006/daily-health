export interface PushMessage {
  /** Expo push token ("ExponentPushToken[…]"). */
  token: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** false = deliver without sound (quiet hours). */
  withSound: boolean;
}

export type PushResult =
  | { ok: true; providerMsgId: string }
  | { ok: false; reason: string; tokenGone: boolean };

/**
 * Sends push notifications. Abstract class (Nest injection token) so the
 * provider can change (Expo today; FCM/APNs directly later) without touching callers.
 */
export abstract class PushSender {
  /** One result per message, in the same order. Never throws for a single bad token. */
  abstract send(messages: PushMessage[]): Promise<PushResult[]>;
}
