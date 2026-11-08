export type SmsResult =
  { ok: true; providerMsgId: string | null } | { ok: false; reason: string };

/**
 * Sends one SMS. The gateway is an open decision (CLAUDE.md §3): plug the
 * chosen provider in by binding its implementation to this token in
 * NotificationsModule. Implementations must never log the number or text.
 */
export abstract class SmsSender {
  /** `phone` is E.164 (+8801XXXXXXXXX); `text` is plain Bangla/English. */
  abstract send(phone: string, text: string): Promise<SmsResult>;
}
