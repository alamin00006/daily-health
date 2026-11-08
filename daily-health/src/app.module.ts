import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { CoreModule } from './core/core.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthProfileModule } from './modules/health-profile/health-profile.module.js';
import { MedicineModule } from './modules/medicine/medicine.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { RecordsModule } from './modules/records/records.module.js';
import { UsersModule } from './modules/users/users.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com,
    // then run `npx @nestjs/observe link` to write your key pair into .env.
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY ?? 'YOUR_APP_KEY',
      appSecret: process.env.OBSERVE_APP_SECRET ?? 'YOUR_APP_SECRET',
      serviceId: 'daily-health',
    }),
    CoreModule,
    AuthModule,
    UsersModule,
    HealthProfileModule,
    RecordsModule,
    NotificationsModule,
    MedicineModule,
  ],
})
export class AppModule {}
