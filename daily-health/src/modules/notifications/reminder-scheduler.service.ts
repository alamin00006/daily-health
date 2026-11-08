import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type {
  NotificationChannel,
  ReminderKind,
  ScheduledReminder,
} from '../../generated/prisma/client.js';
import type { OutgoingNotification } from './notification-delivery.service.js';
import { NotificationDeliveryService } from './notification-delivery.service.js';

export const REMINDERS_QUEUE = 'reminders';
export const FIRE_REMINDER_JOB = 'fire-reminder';
export const RECOVER_REMINDERS_JOB = 'recover-overdue';

/** Re-queues reminders whose BullMQ job was lost (Redis restart, failed enqueue). */
const RECOVERY_INTERVAL_MS = 10 * 60_000;
/** A reminder this late without having fired is treated as lost. */
const LOST_AFTER_MS = 5 * 60_000;

export interface ScheduleReminderInput {
  kind: ReminderKind;
  /** Main recipient. */
  userId: string;
  patientId: string | null;
  /** doseLog, appointment or plan id. */
  refId: string;
  fireAt: Date;
  channels: NotificationChannel[];
}

/**
 * Decides at fire time what (if anything) to send. Returns null or [] when
 * the reminder is no longer relevant (dose already taken): it is then CANCELLED.
 */
export type ReminderHandler = (
  reminder: ScheduledReminder,
) => Promise<OutgoingNotification[] | null>;

/**
 * Server-side reminders (erd.md → "নোটিফিকেশন ও রিমাইন্ডার"): a ScheduledReminder
 * row plus a BullMQ delayed job (jobId = reminder id). Other modules schedule
 * and cancel through this service and register a handler for their kind
 * (medicine → DOSE_BACKUP, REFILL), so this module never reads their tables.
 */
@Injectable()
export class ReminderSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ReminderSchedulerService.name);
  private readonly handlers = new Map<ReminderKind, ReminderHandler>();

  constructor(
    @InjectQueue(REMINDERS_QUEUE) private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly delivery: NotificationDeliveryService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      'reminders-recovery',
      { every: RECOVERY_INTERVAL_MS },
      { name: RECOVER_REMINDERS_JOB, data: {} },
    );
  }

  registerHandler(kind: ReminderKind, handler: ReminderHandler): void {
    this.handlers.set(kind, handler);
  }

  /** Replaces any waiting reminder of the same kind for the same thing. */
  async schedule(input: ScheduleReminderInput): Promise<string> {
    const previous = await this.prisma.scheduledReminder.findMany({
      where: { kind: input.kind, refId: input.refId, status: 'SCHEDULED' },
      select: { id: true },
    });
    const reminder = await this.prisma.$transaction(async (tx) => {
      await tx.scheduledReminder.updateMany({
        where: { kind: input.kind, refId: input.refId, status: 'SCHEDULED' },
        data: { status: 'CANCELLED' },
      });
      return tx.scheduledReminder.create({ data: input });
    });
    await this.removeJobs(previous.map((row) => row.id));
    await this.enqueue(reminder.id, reminder.fireAt);
    return reminder.id;
  }

  async cancel(kind: ReminderKind, refIds: string[]): Promise<void> {
    if (refIds.length === 0) return;
    const rows = await this.prisma.scheduledReminder.findMany({
      where: { kind, refId: { in: refIds }, status: 'SCHEDULED' },
      select: { id: true },
    });
    if (rows.length === 0) return;
    await this.prisma.scheduledReminder.updateMany({
      where: { id: { in: rows.map((row) => row.id) }, status: 'SCHEDULED' },
      data: { status: 'CANCELLED' },
    });
    await this.removeJobs(rows.map((row) => row.id));
  }

  /** Every waiting reminder about a patient (profile deleted). */
  async cancelForPatient(patientId: string): Promise<void> {
    const rows = await this.prisma.scheduledReminder.findMany({
      where: { patientId, status: 'SCHEDULED' },
      select: { id: true },
    });
    await this.prisma.scheduledReminder.updateMany({
      where: { patientId, status: 'SCHEDULED' },
      data: { status: 'CANCELLED' },
    });
    await this.removeJobs(rows.map((row) => row.id));
  }

  /** True when a reminder of this kind for this thing was created after `since`. */
  async existsSince(
    kind: ReminderKind,
    refId: string,
    since: Date,
  ): Promise<boolean> {
    const count = await this.prisma.scheduledReminder.count({
      where: {
        kind,
        refId,
        createdAt: { gte: since },
        status: { in: ['SCHEDULED', 'SENT'] },
      },
    });
    return count > 0;
  }

  /** Worker entry point for FIRE_REMINDER_JOB. Never throws: a retry could double-send. */
  async fire(reminderId: string): Promise<void> {
    const reminder = await this.prisma.scheduledReminder.findUnique({
      where: { id: reminderId },
    });
    if (!reminder || reminder.status !== 'SCHEDULED') return;

    const handler = this.handlers.get(reminder.kind);
    if (!handler) {
      this.logger.error(`No handler for reminder kind ${reminder.kind}`);
      await this.setStatus(reminder.id, 'FAILED');
      return;
    }

    // Claim it, so a duplicate job (recovery + original) cannot send twice.
    const claimed = await this.prisma.scheduledReminder.updateMany({
      where: { id: reminder.id, status: 'SCHEDULED' },
      data: { status: 'SENT', sentAt: new Date() },
    });
    if (claimed.count === 0) return;

    try {
      const notifications = await handler(reminder);
      if (!notifications || notifications.length === 0) {
        await this.setStatus(reminder.id, 'CANCELLED');
        return;
      }
      await this.delivery.deliver(notifications, reminder.id);
    } catch (error) {
      this.logger.error(
        `Reminder ${reminder.id} (${reminder.kind}) failed: ${(error as Error).message}`,
      );
      await this.setStatus(reminder.id, 'FAILED');
    }
  }

  /** Worker entry point for RECOVER_REMINDERS_JOB. */
  async recoverLostJobs(): Promise<void> {
    const now = Date.now();
    const lost = await this.prisma.scheduledReminder.findMany({
      where: {
        status: 'SCHEDULED',
        OR: [
          { jobId: null },
          { fireAt: { lt: new Date(now - LOST_AFTER_MS) } },
        ],
      },
      select: { id: true, fireAt: true },
      take: 500,
    });
    for (const reminder of lost) {
      await this.enqueue(reminder.id, reminder.fireAt);
    }
    if (lost.length > 0) {
      this.logger.warn(`Re-queued ${lost.length} reminder job(s)`);
    }
  }

  private async enqueue(reminderId: string, fireAt: Date): Promise<void> {
    try {
      await this.queue.add(
        FIRE_REMINDER_JOB,
        { reminderId },
        {
          // Same id as the row: re-adding a job that still waits is a no-op.
          jobId: reminderId,
          delay: Math.max(0, fireAt.getTime() - Date.now()),
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      );
      await this.prisma.scheduledReminder.update({
        where: { id: reminderId },
        data: { jobId: reminderId },
      });
    } catch (error) {
      // The row stays SCHEDULED with jobId null; recovery re-queues it.
      this.logger.warn(
        `Could not queue reminder ${reminderId}: ${(error as Error).message}`,
      );
    }
  }

  private async removeJobs(jobIds: string[]): Promise<void> {
    await Promise.all(
      jobIds.map((jobId) =>
        // A job that already started cannot be removed; fire() then sees CANCELLED.
        this.queue.remove(jobId).catch(() => 0),
      ),
    );
  }

  private async setStatus(
    id: string,
    status: ScheduledReminder['status'],
  ): Promise<void> {
    await this.prisma.scheduledReminder.update({
      where: { id },
      data: { status },
    });
  }
}
