import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnModuleInit } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { QuickConsultsService } from './quick-consults.service.js';

export const CONSULTATION_TIMERS_QUEUE = 'consultation-timers';
const SWEEP_JOB = 'sweep-quick-consults';
const INTERVAL_MS = 30_000;

/**
 * Every 30 seconds: unpaid quick consults expire, ones no doctor took are
 * MISSED and refunded, and chats past their time end. One repeating sweep
 * instead of a delayed job per consult, so nothing is lost on restarts.
 */
@Processor(CONSULTATION_TIMERS_QUEUE)
export class ConsultationTimersProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ConsultationTimersProcessor.name);

  constructor(
    @InjectQueue(CONSULTATION_TIMERS_QUEUE) private readonly queue: Queue,
    private readonly quickConsults: QuickConsultsService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      'quick-consults-every-30-s',
      { every: INTERVAL_MS },
      { name: SWEEP_JOB, data: {} },
    );
  }

  async process(job: Job): Promise<void> {
    if (job.name !== SWEEP_JOB) return;
    const { expired, missed, ended } = await this.quickConsults.sweep();
    if (expired || missed || ended) {
      this.logger.log(`Quick consults: ${expired} expired, ${missed} missed, ${ended} ended`);
    }
  }
}
