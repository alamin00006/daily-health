import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationDeliveryService } from './notification-delivery.service.js';
import { NotificationInboxService } from './notification-inbox.service.js';
import { NotificationPreferencesService } from './notification-preferences.service.js';
import { NotificationsController } from './notifications.controller.js';
import { ExpoPushSenderService } from './push/expo-push-sender.service.js';
import { PushSender } from './push/push-sender.js';
import { ReminderDispatchProcessor } from './reminder-dispatch.processor.js';
import {
  REMINDERS_QUEUE,
  ReminderSchedulerService,
} from './reminder-scheduler.service.js';
import { AppConfigService } from '../../core/config/app-config.service.js';
import { AuthOtpSmsListener } from './sms/auth-otp-sms.listener.js';
import { BulkSmsBdSenderService } from './sms/bulksmsbd-sms-sender.service.js';
import { SmsSender } from './sms/sms-sender.js';
import { UnconfiguredSmsSenderService } from './sms/unconfigured-sms-sender.service.js';

/**
 * Push / SMS / in-app delivery, preferences and server reminders (schema
 * `notifications`). Other modules schedule reminders through
 * ReminderSchedulerService and send through NotificationDeliveryService.
 */
@Module({
  imports: [AuthModule, BullModule.registerQueue({ name: REMINDERS_QUEUE })],
  controllers: [NotificationsController],
  providers: [
    NotificationPreferencesService,
    NotificationDeliveryService,
    NotificationInboxService,
    ReminderSchedulerService,
    ReminderDispatchProcessor,
    AuthOtpSmsListener,
    { provide: PushSender, useClass: ExpoPushSenderService },
    // BulkSMSBD once SMS_API_KEY_VALUE and SMS_SENDER_ID are set; otherwise SMS are recorded as not sent.
    {
      provide: SmsSender,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): SmsSender =>
        config.sms ? new BulkSmsBdSenderService(config)
          : new UnconfiguredSmsSenderService(),
    },
  ],
  exports: [
    NotificationPreferencesService,
    NotificationDeliveryService,
    ReminderSchedulerService,
  ],
})
export class NotificationsModule {}
