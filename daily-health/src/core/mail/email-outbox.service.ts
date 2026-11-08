import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { OutgoingEmail } from './email-sender.js';

export const EMAIL_QUEUE = 'email';
export const SEND_EMAIL_JOB = 'send-email';

/**
 * Queues an email for delivery, so a slow SMTP server never blocks a request
 * and failed sends are retried (BullMQ default: 5 attempts, exponential backoff).
 *
 * Job data can hold an OTP code, so finished jobs are removed right away and
 * failed ones after an hour (codes expire in 10 minutes anyway).
 */
@Injectable()
export class EmailOutboxService {
  constructor(@InjectQueue(EMAIL_QUEUE) private readonly queue: Queue) {}

  async enqueue(email: OutgoingEmail): Promise<void> {
    await this.queue.add(SEND_EMAIL_JOB, email, {
      removeOnComplete: true,
      removeOnFail: { age: 3600 },
    });
  }
}
