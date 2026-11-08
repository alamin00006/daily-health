import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { emitAuditEvent } from '../../common/events/audit-event.js';
import { AppException } from '../../common/errors/app-exception.js';
import {
  addDays,
  dhakaDate,
  dhakaStartOfDay,
  dhakaTimeOfDay,
} from '../../common/time/dhaka-time.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import {
  Prisma,
  type DoseLog,
  type DoseSource,
  type MedicationPlan,
  type MedicationTime,
} from '../../generated/prisma/client.js';
import type {
  AdherenceResponse,
  DayScheduleResponse,
  DoseSlotResponse,
  DoseState,
  DoseUnit,
  MealTiming,
  RecordDoseRequest,
} from '../../shared-contracts/medicine.contract.js';
import type { ProfileAccess } from '../users/profile-access.service.js';
import { slotsBetween, slotsOnDate, toSchedulePlan } from './dose-schedule.js';
import { MedicineErrorCode } from './medicine-error-codes.js';
import { MedicineRemindersService } from './medicine-reminders.service.js';

/** Doses are created this far ahead, so backups exist even if the app is offline. */
const MATERIALIZE_AHEAD_MS = 36 * 60 * 60_000;
/** …and this far back, to cover a short server outage. */
const MATERIALIZE_BEHIND_MS = 2 * 60 * 60_000;
/** A dose nobody acted on for this long becomes MISSED. */
const MISSED_AFTER_MS = 6 * 60 * 60_000;
/** Doses more than this far ahead cannot be marked yet. */
const MAX_EARLY_MS = 12 * 60 * 60_000;
/** Taken within this of the time counts as on time. */
const ON_TIME_MS = 60 * 60_000;

type PlanWithTimes = MedicationPlan & { times: MedicationTime[] };

interface MergedSlot {
  plan: PlanWithTimes;
  medicationTimeId: string | null;
  scheduledFor: Date;
  dose: number;
  log: DoseLog | null;
}

@Injectable()
export class DoseLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reminders: MedicineRemindersService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Creates PENDING doses for the next 36 hours of active plans and schedules
   * their backups. Idempotent (unique planId + scheduledFor).
   */
  async ensureUpcomingDoseLogs(planIds?: string[]): Promise<number> {
    const plans = await this.prisma.medicationPlan.findMany({
      where: { isActive: true, ...(planIds ? { id: { in: planIds } } : {}) },
      include: { times: true },
    });
    const now = Date.now();
    const from = new Date(now - MATERIALIZE_BEHIND_MS);
    const to = new Date(now + MATERIALIZE_AHEAD_MS);

    const slots = plans.flatMap((plan) =>
      slotsBetween(toSchedulePlan(plan), from, to),
    );
    if (slots.length === 0) return 0;

    const created = await this.prisma.doseLog.createManyAndReturn({
      data: slots.map((slot) => ({
        planId: slot.planId,
        medicationTimeId: slot.medicationTimeId,
        scheduledFor: slot.scheduledFor,
        dose: new Prisma.Decimal(slot.dose),
      })),
      skipDuplicates: true,
      select: { id: true, planId: true, scheduledFor: true },
    });
    await this.reminders.scheduleDoseBackups(created);
    return created.length;
  }

  /** Doses nobody acted on for 6 hours become MISSED (counted in adherence). */
  async markOverdueAsMissed(): Promise<number> {
    const cutoff = new Date(Date.now() - MISSED_AFTER_MS);
    const { count } = await this.prisma.doseLog.updateMany({
      where: {
        scheduledFor: { lt: cutoff },
        OR: [
          { status: 'PENDING' },
          { status: 'SNOOZED', snoozedUntil: { lt: cutoff } },
        ],
      },
      data: { status: 'MISSED', snoozedUntil: null },
    });
    return count;
  }

  /** After times or the end date change: future untouched doses are rebuilt. */
  async removeFuturePendingDoses(planId: string): Promise<void> {
    const future = await this.prisma.doseLog.findMany({
      where: { planId, status: 'PENDING', scheduledFor: { gt: new Date() } },
      select: { id: true },
    });
    const ids = future.map((log) => log.id);
    await this.reminders.cancelDoseBackups(ids);
    await this.prisma.doseLog.deleteMany({ where: { id: { in: ids } } });
  }

  /**
   * TAKEN / SKIPPED / SNOOZED, or PENDING to undo. Identified by plan and time,
   * so a dose marked offline can be sent later. TAKEN takes the dose out of
   * the stock; undoing a TAKEN puts it back.
   */
  async record(
    userId: string,
    access: ProfileAccess,
    input: RecordDoseRequest,
  ): Promise<DoseSlotResponse> {
    const plan = await this.prisma.medicationPlan.findFirst({
      where: { id: input.planId, patientId: access.profile.id },
      include: { times: true },
    });
    if (!plan) throw planNotFound();

    const scheduledFor = new Date(input.scheduledFor);
    if (scheduledFor.getTime() > Date.now() + MAX_EARLY_MS) {
      throw new AppException(
        MedicineErrorCode.DOSE_TOO_EARLY,
        'This dose is more than 12 hours away',
        HttpStatus.BAD_REQUEST,
      );
    }

    const existing = await this.prisma.doseLog.findUnique({
      where: { planId_scheduledFor: { planId: plan.id, scheduledFor } },
    });
    const slot = slotsOnDate(
      toSchedulePlan(plan),
      dhakaDate(scheduledFor),
    ).find(
      (candidate) =>
        candidate.scheduledFor.getTime() === scheduledFor.getTime(),
    );
    if (!existing && !slot) {
      throw new AppException(
        MedicineErrorCode.DOSE_SLOT_NOT_FOUND,
        'No dose of this medicine is scheduled at that time',
        HttpStatus.NOT_FOUND,
      );
    }

    const actedAt = input.actedAt ? new Date(input.actedAt) : new Date();
    const isUndo = input.status === 'PENDING';
    const snoozedUntil =
      input.status === 'SNOOZED'
        ? new Date(Date.now() + (input.snoozeMinutes ?? 10) * 60_000)
        : null;
    const source: DoseSource =
      access.profile.linkedUserId === userId ? 'APP' : 'CAREGIVER';
    const dose = existing ? existing.dose : new Prisma.Decimal(slot!.dose);

    const fields = {
      status: input.status,
      actedAt: isUndo ? null : actedAt,
      actedByUserId: isUndo ? null : userId,
      snoozedUntil,
      source: isUndo ? null : source,
    };

    const log = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.doseLog.upsert({
        where: { planId_scheduledFor: { planId: plan.id, scheduledFor } },
        create: {
          planId: plan.id,
          medicationTimeId: slot?.medicationTimeId ?? null,
          scheduledFor,
          dose,
          ...fields,
        },
        update: fields,
      });

      const wasTaken = existing?.status === 'TAKEN';
      const isTaken = input.status === 'TAKEN';
      const delta =
        (wasTaken ? dose.toNumber() : 0) - (isTaken ? dose.toNumber() : 0);
      if (delta !== 0) {
        // Never below zero (the patient may have had more than recorded).
        await tx.$executeRaw`
          UPDATE "medicine"."MedicationPlan"
          SET "stockQty" = GREATEST("stockQty" + ${delta}, 0), "updatedAt" = now()
          WHERE "id" = ${plan.id}::uuid AND "stockQty" IS NOT NULL`;
      }
      return saved;
    });

    if (input.status === 'TAKEN' || input.status === 'SKIPPED') {
      await this.reminders.cancelDoseBackups([log.id]);
    } else {
      // Snoozed: family hears about it only if the snooze also passes unanswered.
      await this.reminders.scheduleDoseBackups(
        [log],
        snoozedUntil ?? undefined,
      );
    }
    if (input.status === 'TAKEN') await this.reminders.checkRefill(plan.id);

    emitAuditEvent(this.events, {
      actorUserId: userId,
      patientId: access.profile.id,
      action: 'dose.record',
      entityType: 'DoseLog',
      entityId: log.id,
      meta: { status: input.status },
    });

    return toSlotResponse(
      {
        plan,
        medicationTimeId: log.medicationTimeId,
        scheduledFor: log.scheduledFor,
        dose: log.dose.toNumber(),
        log,
      },
      new Date(),
    );
  }

  /** Every dose of one Asia/Dhaka day, with its state, for the medicine screen. */
  async daySchedule(
    userId: string,
    access: ProfileAccess,
    date: string = dhakaDate(),
  ): Promise<DayScheduleResponse> {
    const now = new Date();
    const doses = (await this.mergedSlots(access.profile.id, date, date)).map(
      (slot) => toSlotResponse(slot, now),
    );
    this.auditView(userId, access, 'dose.view');

    const count = (state: DoseState) =>
      doses.filter((dose) => dose.state === state).length;
    return {
      date,
      doses,
      summary: {
        total: doses.length,
        taken: count('TAKEN'),
        skipped: count('SKIPPED'),
        missed: count('MISSED'),
        remaining: count('UPCOMING') + count('DUE') + count('SNOOZED'),
      },
    };
  }

  /** How many doses whose time has passed were taken, over the last `days` days. */
  async adherence(
    userId: string,
    access: ProfileAccess,
    days: number,
  ): Promise<AdherenceResponse> {
    const to = dhakaDate();
    const from = addDays(to, -(days - 1));
    const now = new Date();
    const past = (await this.mergedSlots(access.profile.id, from, to)).filter(
      (slot) => slot.scheduledFor <= now,
    );

    const daily = new Map<string, { scheduled: number; taken: number }>();
    for (let date = from; date <= to; date = addDays(date, 1)) {
      daily.set(date, { scheduled: 0, taken: 0 });
    }

    let taken = 0;
    let takenOnTime = 0;
    let skipped = 0;
    let missed = 0;
    for (const slot of past) {
      const day = daily.get(dhakaDate(slot.scheduledFor));
      if (day) day.scheduled += 1;
      const status = slot.log?.status ?? 'PENDING';
      if (status === 'TAKEN') {
        taken += 1;
        if (day) day.taken += 1;
        const actedAt = slot.log?.actedAt;
        if (
          actedAt &&
          Math.abs(actedAt.getTime() - slot.scheduledFor.getTime()) <=
            ON_TIME_MS
        ) {
          takenOnTime += 1;
        }
      } else if (status === 'SKIPPED') {
        skipped += 1;
      } else if (status === 'MISSED') {
        missed += 1;
      }
    }

    this.auditView(userId, access, 'dose.adherence.view');
    return {
      from,
      to,
      scheduled: past.length,
      taken,
      takenOnTime,
      skipped,
      missed,
      percent:
        past.length === 0 ? null : Math.round((taken / past.length) * 100),
      daily: [...daily.entries()].map(([date, value]) => ({ date, ...value })),
    };
  }

  /**
   * Scheduled doses (from the plans) joined with what was recorded. Recorded
   * doses whose slot no longer exists (times edited, plan stopped) still count.
   */
  private async mergedSlots(
    patientId: string,
    fromDate: string,
    toDate: string,
  ): Promise<MergedSlot[]> {
    const plans = await this.prisma.medicationPlan.findMany({
      where: { patientId },
      include: { times: true },
    });
    if (plans.length === 0) return [];

    const from = dhakaStartOfDay(fromDate);
    const to = new Date(dhakaStartOfDay(addDays(toDate, 1)).getTime() - 1);
    const logs = await this.prisma.doseLog.findMany({
      where: {
        planId: { in: plans.map((plan) => plan.id) },
        scheduledFor: { gte: from, lte: to },
      },
    });

    const planById = new Map(plans.map((plan) => [plan.id, plan]));
    const merged = new Map<string, MergedSlot>();
    for (const plan of plans) {
      for (const slot of slotsBetween(toSchedulePlan(plan), from, to)) {
        // A stopped plan keeps the doses it had before it was stopped.
        if (plan.stoppedAt && slot.scheduledFor >= plan.stoppedAt) continue;
        merged.set(key(plan.id, slot.scheduledFor), {
          plan,
          medicationTimeId: slot.medicationTimeId,
          scheduledFor: slot.scheduledFor,
          dose: slot.dose,
          log: null,
        });
      }
    }
    for (const log of logs) {
      const slotKey = key(log.planId, log.scheduledFor);
      const slot = merged.get(slotKey);
      if (slot) {
        slot.log = log;
        continue;
      }
      // A future untouched dose of a stopped plan is not a dose any more.
      const plan = planById.get(log.planId)!;
      if (!plan.isActive && log.status === 'PENDING') continue;
      merged.set(slotKey, {
        plan,
        medicationTimeId: log.medicationTimeId,
        scheduledFor: log.scheduledFor,
        dose: log.dose.toNumber(),
        log,
      });
    }
    return [...merged.values()].sort(
      (a, b) =>
        a.scheduledFor.getTime() - b.scheduledFor.getTime() ||
        a.plan.displayName.localeCompare(b.plan.displayName),
    );
  }

  private auditView(userId: string, access: ProfileAccess, action: string) {
    emitAuditEvent(this.events, {
      actorUserId: userId,
      patientId: access.profile.id,
      action,
      entityType: 'DoseLog',
      entityId: access.profile.id,
    });
  }
}

function key(planId: string, scheduledFor: Date): string {
  return `${planId}|${scheduledFor.toISOString()}`;
}

function stateOf(
  log: DoseLog | null,
  scheduledFor: Date,
  now: Date,
): DoseState {
  const status = log?.status ?? 'PENDING';
  switch (status) {
    case 'TAKEN':
    case 'SKIPPED':
    case 'MISSED':
      return status;
    case 'SNOOZED':
      return log?.snoozedUntil && log.snoozedUntil > now ? 'SNOOZED' : 'DUE';
    default:
      return scheduledFor > now ? 'UPCOMING' : 'DUE';
  }
}

function toSlotResponse(slot: MergedSlot, now: Date): DoseSlotResponse {
  const log = slot.log;
  return {
    doseLogId: log?.id ?? null,
    planId: slot.plan.id,
    medicationTimeId: slot.medicationTimeId,
    displayName: slot.plan.displayName,
    doseUnit: slot.plan.doseUnit as DoseUnit,
    dose: slot.dose,
    mealTiming: slot.plan.mealTiming as MealTiming,
    mealOffsetMin: slot.plan.mealOffsetMin,
    scheduledFor: slot.scheduledFor.toISOString(),
    time: dhakaTimeOfDay(slot.scheduledFor),
    status: log?.status ?? 'PENDING',
    state: stateOf(log, slot.scheduledFor, now),
    actedAt: log?.actedAt?.toISOString() ?? null,
    actedByUserId: log?.actedByUserId ?? null,
    snoozedUntil: log?.snoozedUntil?.toISOString() ?? null,
  };
}

function planNotFound(): AppException {
  return new AppException(
    MedicineErrorCode.MEDICATION_PLAN_NOT_FOUND,
    'Medicine not found',
    HttpStatus.NOT_FOUND,
  );
}
