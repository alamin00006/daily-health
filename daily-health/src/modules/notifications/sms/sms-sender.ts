export type SmsResult =
  { ok: true; providerMsgId: string | null } | { ok: false; reason: string };

/**
 * Sends one SMS. NotificationsModule binds BulkSMSBD when its env is set,
 * otherwise the unconfigured sender. Implementations never throw and
 * never log the number or text.
 */
export abstract class SmsSender {
  /** `phone` is E.164 (+8801XXXXXXXXX); `text` is plain Bangla/English. */
  abstract send(phone: string, text: string): Promise<SmsResult>;
}
