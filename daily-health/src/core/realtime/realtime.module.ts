import { Global, Module } from '@nestjs/common';
import { RealtimeController } from './realtime.controller.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { RealtimeTicketsService } from './realtime-tickets.service.js';
import { RealtimeService } from './realtime.service.js';

/** Socket.io for chat, call signalling and live queues (CLAUDE.md §2). */
@Global()
@Module({
  controllers: [RealtimeController],
  providers: [RealtimeTicketsService, RealtimeService, RealtimeGateway],
  exports: [RealtimeService],
})
export class RealtimeModule {}
