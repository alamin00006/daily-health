import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnModuleInit } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { PaymentsService } from './payments.service.js';
import { RefundsService } from './refunds.service.js';

export const PAYMENT_MAINTENANCE_QUEUE = 'payment-maintenance';
const RECONCILE_JOB = 'reconcile-payments';
const INTERVAL_MS = 5 * 60_000;

/**
 * Every 5 minutes: checkouts whose return / IPN never arrived are verified
 * with the gateway (or closed as abandoned), and refunds are sent or polled.
 */
@Processor(PAYMENT_MAINTENANCE_QUEUE)
export class PaymentMaintenanceProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(PaymentMaintenanceProcessor.name);

  constructor(
    @InjectQueue(PAYMENT_MAINTENANCE_QUEUE) private readonly queue: Queue,
    private readonly payments: PaymentsService,
    private readonly refunds: RefundsService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      'payments-every-5-min',
      { every: INTERVAL_MS },
      { name: RECONCILE_JOB, data: {} },
    );
  }

  async process(job: Job): Promise<void> {
    if (job.name !== RECONCILE_JOB) return;
    const checked = await this.payments.reconcileOpenPayments();
    const sent = await this.refunds.sendPending();
    const polled = await this.refunds.pollRequested();
    if (checked || sent || polled) {
      this.logger.log(`Payments: ${checked} checked, ${sent} refund(s) sent, ${polled} polled`);
    }
  }
}
