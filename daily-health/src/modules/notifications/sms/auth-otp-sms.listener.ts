import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  AUTH_OTP_SMS_EVENT,
  type AuthOtpSmsEvent,
} from '../../auth/account-identifier.js';
import { SmsSender } from './sms-sender.js';

/**
 * Sends the auth module's one-time codes by SMS. Nothing is stored (a code is not a
 * notification) and neither the number nor the text is logged, only the failure reason.
 */
@Injectable()
export class AuthOtpSmsListener {
  private readonly logger = new Logger(AuthOtpSmsListener.name);

  constructor(private readonly sms: SmsSender) {}

  @OnEvent(AUTH_OTP_SMS_EVENT, { async: true, promisify: true })
  async send(event: AuthOtpSmsEvent): Promise<void> {
    const result = await this.sms.send(event.phone, event.text);
    if (!result.ok) this.logger.warn(`Login code SMS not sent: ${result.reason}`);
  }
}
