import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnModuleInit } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import {
  APPOINTMENT_HOLDS_QUEUE,
  AppointmentBookingService,
  EXPIRE_HOLD_JOB,
} from './appointment-booking.service.js';

const SWEEP_JOB = 'sweep-expired-holds';
const SWEEP_INTERVAL_MS = 2 * 60_000;

/**
 * Ends unpaid holds: one delayed job per booking, plus a sweep every two
 * minutes for jobs lost in a Redis restart.
 */
@Processor(APPOINTMENT_HOLDS_QUEUE)
export class AppointmentHoldsProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(AppointmentHoldsProcessor.name);

  constructor(
    @InjectQueue(APPOINTMENT_HOLDS_QUEUE) private readonly queue: Queue,
    private readonly booking: AppointmentBookingService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      'appointment-hold-sweep',
      { every: SWEEP_INTERVAL_MS },
      { name: SWEEP_JOB, data: {} },
    );
  }

  async process(job: Job<{ appointmentId?: string }>): Promise<void> {
    if (job.name === EXPIRE_HOLD_JOB && job.data.appointmentId) {
      await this.booking.expireHold(job.data.appointmentId);
      return;
    }
    if (job.name === SWEEP_JOB) {
      const expired = await this.booking.expireOverdueHolds();
      if (expired > 0) this.logger.log(`Expired ${expired} unpaid hold(s)`);
    }
  }
}
