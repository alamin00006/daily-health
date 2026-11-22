import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { AppConfigService } from '../config/app-config.service.js';
import { EmailSender, type OutgoingEmail } from './email-sender.js';

/** Sends with nodemailer through Gmail (SMTP_SERVICE / SMTP_USER / SMTP_PASSWORD). */
@Injectable()
export class SmtpEmailSenderService
  extends EmailSender
  implements OnApplicationShutdown
{
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: AppConfigService) {
    super();
    const { service, auth, from } = config.smtp;
    this.from = from;
    this.transporter = createTransport({
      service,
      auth,
      pool: true,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async send(email: OutgoingEmail): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...email });
  }

  onApplicationShutdown(): void {
    this.transporter.close();
  }
}
