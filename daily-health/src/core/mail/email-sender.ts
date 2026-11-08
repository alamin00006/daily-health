export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Delivers one email. Abstract class so it can be the Nest injection token:
 * SMTP (nodemailer) today; an HTTP provider can replace it without touching callers.
 * Callers normally use EmailOutbox (queued, retried) instead of this directly.
 */
export abstract class EmailSender {
  abstract send(email: OutgoingEmail): Promise<void>;
}
