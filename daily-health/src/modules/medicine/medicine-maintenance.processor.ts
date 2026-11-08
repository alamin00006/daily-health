import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnModuleInit } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { DoseLogsService } from './dose-logs.service.js';
import { MedicineRemindersService } from './medicine-reminders.service.js';

export const MEDICINE_MAINTENANCE_QUEUE = 'medicine-maintenance';
const MAINTENANCE_JOB = 'dose-maintenance';
const MAINTENANCE_INTERVAL_MS = 30 * 60_000;

/**
 * Every 30 minutes: create the next 36 hours of doses (with their backup
 * reminders), mark doses nobody acted on as MISSED, and send refill alerts.
 * One job at a time across servers (BullMQ job scheduler).
 */
@Processor(MEDICINE_MAINTENANCE_QUEUE)
export class MedicineMaintenanceProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(MedicineMaintenanceProcessor.name);

  constructor(
    @InjectQueue(MEDICINE_MAINTENANCE_QUEUE) private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly doseLogs: DoseLogsService,
    private readonly reminders: MedicineRemindersService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      'dose-maintenance-every-30-min',
      { every: MAINTENANCE_INTERVAL_MS, immediately: true },
      { name: MAINTENANCE_JOB, data: {} },
    );
  }

  async process(job: Job): Promise<void> {
    if (job.name !== MAINTENANCE_JOB) return;
    const created = await this.doseLogs.ensureUpcomingDoseLogs();
    const missed = await this.doseLogs.markOverdueAsMissed();

    const lowStockCandidates = await this.prisma.medicationPlan.findMany({
      where: { isActive: true, stockQty: { not: null } },
      select: { id: true },
    });
    for (const plan of lowStockCandidates) {
      await this.reminders.checkRefill(plan.id);
    }
    this.logger.log(
      `Dose maintenance: ${created} dose(s) scheduled, ${missed} marked missed`,
    );
  }
}
