import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { EmailDeliveryProcessor } from './email-delivery.processor.js';
import { EMAIL_QUEUE, EmailOutboxService } from './email-outbox.service.js';
import { EmailSender } from './email-sender.js';
import { SmtpEmailSenderService } from './smtp-email-sender.service.js';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: EMAIL_QUEUE })],
  providers: [
    { provide: EmailSender, useClass: SmtpEmailSenderService },
    EmailOutboxService,
    EmailDeliveryProcessor,
  ],
  exports: [EmailOutboxService],
})
export class MailModule {}
