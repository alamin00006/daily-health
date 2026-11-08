import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { AppConfigService } from '../config/app-config.service.js';
import { EmailSender, type OutgoingEmail } from './email-sender.js';

/** Sends through any SMTP server (Mailpit locally; Gmail/Zoho/Brevo/SES SMTP in production). */
@Injectable()
export class SmtpEmailSenderService
  extends EmailSender
  implements OnApplicationShutdown
{
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: AppConfigService) {
    super();
    const { host, port, secure, auth, from } = config.smtp;
    this.from = from;
    this.transporter = createTransport({
      host,
      port,
      secure,
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
