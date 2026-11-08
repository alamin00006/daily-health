import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DeliveryFailure } from '../notifications-error-codes.js';
import { SmsSender, type SmsResult } from './sms-sender.js';

/**
 * Used until an SMS gateway is chosen (CLAUDE.md §3 "Open decisions").
 * Sends nothing and reports SMS_PROVIDER_NOT_CONFIGURED, so the Notification
 * row honestly shows FAILED instead of pretending the SMS went out.
 */
@Injectable()
export class UnconfiguredSmsSenderService
  extends SmsSender
  implements OnModuleInit
{
  private readonly logger = new Logger(UnconfiguredSmsSenderService.name);

  onModuleInit(): void {
    this.logger.warn(
      'No SMS gateway configured: SMS notifications are recorded as FAILED (SMS_PROVIDER_NOT_CONFIGURED).',
    );
  }

  send(): Promise<SmsResult> {
    return Promise.resolve({
      ok: false,
      reason: DeliveryFailure.SMS_PROVIDER_NOT_CONFIGURED,
    });
  }
}
