import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import {
  FIRE_REMINDER_JOB,
  RECOVER_REMINDERS_JOB,
  REMINDERS_QUEUE,
  ReminderSchedulerService,
} from './reminder-scheduler.service.js';

/** Worker for the reminders queue. */
@Processor(REMINDERS_QUEUE)
export class ReminderDispatchProcessor extends WorkerHost {
  constructor(private readonly scheduler: ReminderSchedulerService) {
    super();
  }

  async process(job: Job<{ reminderId?: string }>): Promise<void> {
    if (job.name === FIRE_REMINDER_JOB && job.data.reminderId) {
      await this.scheduler.fire(job.data.reminderId);
    } else if (job.name === RECOVER_REMINDERS_JOB) {
      await this.scheduler.recoverLostJobs();
    }
  }
}
