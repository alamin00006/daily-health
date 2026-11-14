import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { StaffRoleGuard } from '../../common/auth/staff-role.guard.js';
import { StaffModule } from '../admin/staff.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module.js';
import { UsersModule } from '../users/users.module.js';
import { ShopAdminCatalogService } from './shop-admin-catalog.service.js';
import { ShopCartService } from './shop-cart.service.js';
import { ShopCatalogService } from './shop-catalog.service.js';
import { ShopOrderHoldsProcessor } from './shop-order-holds.processor.js';
import { SHOP_ORDER_HOLDS_QUEUE, ShopOrdersService } from './shop-orders.service.js';
import { ShopSettingsService } from './shop-settings.service.js';
import { ShopStaffOrdersService } from './shop-staff-orders.service.js';
import { ShopStockService } from './shop-stock.service.js';
import {
  ShopCartController,
  ShopCatalogController,
  ShopEnabledGuard,
  ShopOrdersController,
  ShopStatusController,
} from './shop.controller.js';
import { StaffShopController } from './staff-shop.controller.js';

/**
 * HealthStore (schema `shop`): catalog, inventory ledger, cart, delivery, orders.
 * Admins switch it on/off (ShopSetting). Payments come through the payments module
 * (purpose ORDER); prescriptions are checked through PrescriptionLookupService.
 */
@Module({
  imports: [
    AuthModule,
    UsersModule,
    StaffModule,
    NotificationsModule,
    PaymentsModule,
    PrescriptionsModule,
    BullModule.registerQueue({ name: SHOP_ORDER_HOLDS_QUEUE }),
  ],
  controllers: [
    ShopStatusController,
    ShopCatalogController,
    ShopCartController,
    ShopOrdersController,
    StaffShopController,
  ],
  providers: [
    ShopSettingsService,
    ShopCatalogService,
    ShopAdminCatalogService,
    ShopStockService,
    ShopCartService,
    ShopOrdersService,
    ShopStaffOrdersService,
    ShopOrderHoldsProcessor,
    ShopEnabledGuard,
    StaffRoleGuard,
  ],
  exports: [ShopStaffOrdersService, ShopSettingsService],
})
export class ShopModule {}
