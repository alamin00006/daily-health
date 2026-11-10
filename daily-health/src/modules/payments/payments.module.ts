import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { StaffRoleGuard } from '../../common/auth/staff-role.guard.js';
import { AuthModule } from '../auth/auth.module.js';
import { DoctorsModule } from '../doctors/doctors.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { UsersModule } from '../users/users.module.js';
import { AdminPaymentsController, MyEarningsController } from './earnings.controller.js';
import { EarningsService } from './earnings.service.js';
import { ShurjoPayGatewayService } from './gateways/shurjopay-gateway.service.js';
import { SslCommerzGatewayService } from './gateways/sslcommerz-gateway.service.js';
import { PayableRegistryService } from './payable-registry.service.js';
import { PaymentGatewaysService } from './payment-gateways.service.js';
import {
  PAYMENT_MAINTENANCE_QUEUE,
  PaymentMaintenanceProcessor,
} from './payment-maintenance.processor.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { RefundsService } from './refunds.service.js';

/**
 * Payments through an aggregator (schema `payments`): checkout, verification,
 * refunds, provider earnings and payouts. shurjoPay and SSLCommerz sit behind
 * PaymentGateway; PAYMENT_GATEWAY picks the one new payments use. Other
 * modules register what can be paid for (PayableRegistryService) and react to
 * `payment.succeeded`.
 */
@Module({
  imports: [
    AuthModule,
    UsersModule,
    DoctorsModule,
    NotificationsModule,
    BullModule.registerQueue({ name: PAYMENT_MAINTENANCE_QUEUE }),
  ],
  controllers: [PaymentsController, MyEarningsController, AdminPaymentsController],
  providers: [
    ShurjoPayGatewayService,
    SslCommerzGatewayService,
    PaymentGatewaysService,
    PayableRegistryService,
    PaymentsService,
    RefundsService,
    EarningsService,
    PaymentMaintenanceProcessor,
    StaffRoleGuard,
  ],
  exports: [PayableRegistryService, PaymentsService],
})
export class PaymentsModule {}
