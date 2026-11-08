import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { EMAIL_QUEUE } from './email-outbox.service.js';
import { EmailSender, type OutgoingEmail } from './email-sender.js';

/** Worker for the email queue. Never logs the recipient or the content. */
@Processor(EMAIL_QUEUE)
export class EmailDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailDeliveryProcessor.name);

  constructor(private readonly sender: EmailSender) {
    super();
  }

  async process(job: Job<OutgoingEmail>): Promise<void> {
    try {
      await this.sender.send(job.data);
    } catch (error) {
      this.logger.warn(
        `Email job ${job.id} attempt ${job.attemptsMade + 1} failed: ${(error as Error).message}`,
      );
      throw error;
    }
  }
}
