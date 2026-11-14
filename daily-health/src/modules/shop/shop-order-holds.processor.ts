import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnModuleInit } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { EXPIRE_ORDER_HOLD_JOB, SHOP_ORDER_HOLDS_QUEUE, ShopOrdersService } from './shop-orders.service.js';

const SWEEP_JOB = 'sweep-expired-order-holds';
const SWEEP_INTERVAL_MS = 2 * 60_000;

/**
 * Ends unpaid online orders and puts their stock back: one delayed job per order,
 * plus a sweep every two minutes for jobs lost in a Redis restart.
 */
@Processor(SHOP_ORDER_HOLDS_QUEUE)
export class ShopOrderHoldsProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ShopOrderHoldsProcessor.name);

  constructor(
    @InjectQueue(SHOP_ORDER_HOLDS_QUEUE) private readonly queue: Queue,
    private readonly orders: ShopOrdersService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      'shop-order-hold-sweep',
      { every: SWEEP_INTERVAL_MS },
      { name: SWEEP_JOB, data: {} },
    );
  }

  async process(job: Job<{ orderId?: string }>): Promise<void> {
    if (job.name === EXPIRE_ORDER_HOLD_JOB && job.data.orderId) {
      await this.orders.expireHold(job.data.orderId);
      return;
    }
    if (job.name === SWEEP_JOB) {
      const expired = await this.orders.expireOverdueHolds();
      if (expired > 0) this.logger.log(`Expired ${expired} unpaid order(s)`);
    }
  }
}
