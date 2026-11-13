import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { WomensHealthController } from './womens-health.controller.js';
import { WomensHealthService } from './womens-health.service.js';

/**
 * Period tracker, daily symptoms and mood, pregnancy (schema `womens_health`).
 * Only the patient themself sees it; the women's quick consult lives in the
 * consultation module, and the section lock PIN never leaves the phone.
 */
@Module({
  imports: [UsersModule],
  controllers: [WomensHealthController],
  providers: [WomensHealthService],
})
export class WomensHealthModule {}
