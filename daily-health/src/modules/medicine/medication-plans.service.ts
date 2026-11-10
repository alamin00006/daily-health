import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { emitAuditEvent } from '../../common/events/audit-event.js';
import { AppException } from '../../common/errors/app-exception.js';
import {
  dateColumnToString,
  dhakaDate,
  hhmmToTimeColumn,
  stringToDateColumn,
  timeColumnToHhmm,
} from '../../common/time/dhaka-time.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import {
  Prisma,
  type Medicine,
  type MedicationPlan,
  type MedicationTime,
} from '../../generated/prisma/client.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import type {
  CreateMedicationPlanRequest,
  DoseUnit,
  MealTiming,
  MedicationPlanResponse,
  MedicationTimeInput,
  RestockRequest,
  UpdateMedicationPlanRequest,
} from '../../shared-contracts/medicine.contract.js';
import {
  PROFILE_DELETED_EVENT,
  type ProfileDeletedEvent,
} from '../users/patient-profiles.service.js';
import type { ProfileAccess } from '../users/profile-access.service.js';
import { DoseLogsService } from './dose-logs.service.js';
import {
  daysFromMask,
  dosePattern,
  maskFromDays,
  stockDaysLeft,
  toScheduleTimes,
} from './dose-schedule.js';
import { MedicineCatalogService } from './medicine-catalog.service.js';
import { MedicineErrorCode } from './medicine-error-codes.js';
import { MedicineRemindersService } from './medicine-reminders.service.js';

type PlanWithRelations = MedicationPlan & {
  times: MedicationTime[];
  medicine: Medicine | null;
};

const PLAN_INCLUDE = {
  times: { orderBy: { timeOfDay: 'asc' } },
  medicine: true,
} as const;

/**
 * The patient's medicines and their daily times. Every change rebuilds the
 * upcoming doses (and their backup reminders); the app re-reads the plans to
 * reschedule its local alarms.
 */
@Injectable()
export class MedicationPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: MedicineCatalogService,
    private readonly doseLogs: DoseLogsService,
    private readonly reminders: MedicineRemindersService,
    private readonly events: EventEmitter2,
  ) {}

  async create(
    userId: string,
    access: ProfileAccess,
    input: CreateMedicationPlanRequest,
    /** Set when made from a prescription line (prescriptions module). */
    prescriptionItemId: string | null = null,
  ): Promise<MedicationPlanResponse> {
    if (
      input.medicineId &&
      !(await this.catalog.findActive(input.medicineId))
    ) {
      throw new AppException(
        MedicineErrorCode.MEDICINE_NOT_FOUND,
        'Medicine not found in the catalog',
        HttpStatus.NOT_FOUND,
      );
    }

    const plan = await this.prisma.medicationPlan.create({
      data: {
        patientId: access.profile.id,
        medicineId: input.medicineId ?? null,
        prescriptionItemId,
        displayName: input.displayName,
        doseUnit: input.doseUnit,
        mealTiming: input.mealTiming,
        mealOffsetMin: input.mealOffsetMin ?? null,
        startDate: stringToDateColumn(input.startDate ?? dhakaDate()),
        endDate: input.endDate ? stringToDateColumn(input.endDate) : null,
        stockQty:
          input.stockQty == null ? null : new Prisma.Decimal(input.stockQty),
        refillAlertDays: input.refillAlertDays,
        createdByUserId: userId,
        times: { create: input.times.map(toTimeRow) },
      },
      include: PLAN_INCLUDE,
    });

    await this.doseLogs.ensureUpcomingDoseLogs([plan.id]);
    await this.reminders.checkRefill(plan.id);
    this.audit(userId, access, 'medicine.plan.create', plan.id);
    return toPlanResponse(plan);
  }

  /** Alarms already made from these prescription lines (newest per line). */
  async plansForPrescriptionItems(
    patientId: string,
    itemIds: string[],
  ): Promise<Map<string, { planId: string; isActive: boolean }>> {
    if (itemIds.length === 0) return new Map();
    const rows = await this.prisma.medicationPlan.findMany({
      where: { patientId, prescriptionItemId: { in: [...new Set(itemIds)] } },
      select: { id: true, prescriptionItemId: true, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    return new Map(
      rows.flatMap((row) =>
        row.prescriptionItemId
          ? [[row.prescriptionItemId, { planId: row.id, isActive: row.isActive }] as const]
          : [],
      ),
    );
  }

  /** Active medicines first (by name); stopped ones only when asked. */
  async list(
    userId: string,
    access: ProfileAccess,
    includeStopped: boolean,
  ): Promise<PaginatedResponse<MedicationPlanResponse>> {
    const plans = await this.prisma.medicationPlan.findMany({
      where: {
        patientId: access.profile.id,
        ...(includeStopped ? {} : { isActive: true }),
      },
      include: PLAN_INCLUDE,
      orderBy: [{ isActive: 'desc' }, { displayName: 'asc' }],
    });
    this.audit(userId, access, 'medicine.plan.list', access.profile.id);
    return {
      data: plans.map(toPlanResponse),
      meta: { cursor: null, hasMore: false },
    };
  }

  async get(
    userId: string,
    access: ProfileAccess,
    planId: string,
  ): Promise<MedicationPlanResponse> {
    const plan = await this.findOwned(access, planId);
    this.audit(userId, access, 'medicine.plan.view', plan.id);
    return toPlanResponse(plan);
  }

  async update(
    userId: string,
    access: ProfileAccess,
    planId: string,
    input: UpdateMedicationPlanRequest,
  ): Promise<MedicationPlanResponse> {
    const current = await this.findOwned(access, planId);
    if (!current.isActive) throw planStopped();

    const startDate = dateColumnToString(current.startDate);
    if (input.endDate && input.endDate < startDate) {
      throw new AppException(
        'VALIDATION_FAILED',
        'End date must not be before the start date',
        HttpStatus.BAD_REQUEST,
        {
          issues: [
            {
              path: 'endDate',
              code: 'too_small',
              message: 'End date must not be before the start date',
            },
          ],
        },
      );
    }

    const scheduleChanged =
      input.times !== undefined || input.endDate !== undefined;

    const plan = await this.prisma.$transaction(async (tx) => {
      if (input.times) {
        // Old times are deleted; their recorded doses keep medicationTimeId = null.
        await tx.medicationTime.deleteMany({ where: { planId } });
        await tx.medicationTime.createMany({
          data: input.times.map((time) => ({ planId, ...toTimeRow(time) })),
        });
      }
      return tx.medicationPlan.update({
        where: { id: planId },
        data: {
          ...(input.displayName !== undefined
            ? { displayName: input.displayName }
            : {}),
          ...(input.doseUnit !== undefined ? { doseUnit: input.doseUnit } : {}),
          ...(input.mealTiming !== undefined
            ? { mealTiming: input.mealTiming }
            : {}),
          ...(input.mealOffsetMin !== undefined
            ? { mealOffsetMin: input.mealOffsetMin }
            : {}),
          ...(input.endDate !== undefined
            ? {
                endDate: input.endDate
                  ? stringToDateColumn(input.endDate)
                  : null,
              }
            : {}),
          ...(input.stockQty !== undefined
            ? {
                stockQty:
                  input.stockQty === null
                    ? null
                    : new Prisma.Decimal(input.stockQty),
              }
            : {}),
          ...(input.refillAlertDays !== undefined
            ? { refillAlertDays: input.refillAlertDays }
            : {}),
        },
        include: PLAN_INCLUDE,
      });
    });

    if (scheduleChanged) {
      await this.doseLogs.removeFuturePendingDoses(planId);
      await this.doseLogs.ensureUpcomingDoseLogs([planId]);
    }
    await this.reminders.checkRefill(planId);
    this.audit(userId, access, 'medicine.plan.update', planId, {
      fields: Object.keys(input).sort().join(','),
    });
    return toPlanResponse(plan);
  }

  /** Bought more: adds to the stock (starts tracking it if it was not). */
  async restock(
    userId: string,
    access: ProfileAccess,
    planId: string,
    input: RestockRequest,
  ): Promise<MedicationPlanResponse> {
    const current = await this.findOwned(access, planId);
    const stock = (current.stockQty?.toNumber() ?? 0) + input.quantity;
    const plan = await this.prisma.medicationPlan.update({
      where: { id: planId },
      data: { stockQty: new Prisma.Decimal(stock) },
      include: PLAN_INCLUDE,
    });
    this.audit(userId, access, 'medicine.plan.restock', planId);
    return toPlanResponse(plan);
  }

  /** The course is over or the doctor stopped it. History stays. */
  async stop(
    userId: string,
    access: ProfileAccess,
    planId: string,
  ): Promise<MedicationPlanResponse> {
    const current = await this.findOwned(access, planId);
    if (!current.isActive) return toPlanResponse(current);

    const today = dhakaDate();
    const currentEnd = current.endDate
      ? dateColumnToString(current.endDate)
      : null;
    const plan = await this.prisma.medicationPlan.update({
      where: { id: planId },
      data: {
        isActive: false,
        stoppedAt: new Date(),
        // Keep an earlier end date; otherwise it ends today.
        ...(currentEnd && currentEnd < today
          ? {}
          : { endDate: stringToDateColumn(today) }),
      },
      include: PLAN_INCLUDE,
    });
    await this.doseLogs.removeFuturePendingDoses(planId);
    this.audit(userId, access, 'medicine.plan.stop', planId);
    return toPlanResponse(plan);
  }

  /** Added by mistake: removes the plan and its dose history. */
  async remove(
    userId: string,
    access: ProfileAccess,
    planId: string,
  ): Promise<void> {
    await this.findOwned(access, planId);
    const logs = await this.prisma.doseLog.findMany({
      where: { planId },
      select: { id: true },
    });
    await this.reminders.cancelDoseBackups(logs.map((log) => log.id));
    await this.prisma.medicationPlan.delete({ where: { id: planId } });
    this.audit(userId, access, 'medicine.plan.delete', planId);
  }

  /** A deleted profile takes no more medicine: stop plans, drop reminders. */
  @OnEvent(PROFILE_DELETED_EVENT, { async: true, promisify: true })
  async onProfileDeleted(event: ProfileDeletedEvent): Promise<void> {
    const now = new Date();
    await this.prisma.medicationPlan.updateMany({
      where: { patientId: event.profileId, isActive: true },
      data: { isActive: false, stoppedAt: now },
    });
    await this.reminders.cancelForPatient(event.profileId);
  }

  private async findOwned(
    access: ProfileAccess,
    planId: string,
  ): Promise<PlanWithRelations> {
    const plan = await this.prisma.medicationPlan.findFirst({
      where: { id: planId, patientId: access.profile.id },
      include: PLAN_INCLUDE,
    });
    if (!plan) {
      throw new AppException(
        MedicineErrorCode.MEDICATION_PLAN_NOT_FOUND,
        'Medicine not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return plan;
  }

  private audit(
    userId: string,
    access: ProfileAccess,
    action: string,
    entityId: string,
    meta?: Record<string, string>,
  ): void {
    emitAuditEvent(this.events, {
      actorUserId: userId,
      patientId: access.profile.id,
      action,
      entityType: 'MedicationPlan',
      entityId,
      ...(meta ? { meta } : {}),
    });
  }
}

function toTimeRow(time: MedicationTimeInput) {
  return {
    timeOfDay: hhmmToTimeColumn(time.time),
    dose: new Prisma.Decimal(time.dose),
    daysMask: maskFromDays(time.days),
  };
}

function planStopped(): AppException {
  return new AppException(
    MedicineErrorCode.MEDICATION_PLAN_STOPPED,
    'This medicine was stopped; add it again to restart',
    HttpStatus.CONFLICT,
  );
}

export function toPlanResponse(
  plan: PlanWithRelations,
): MedicationPlanResponse {
  const times = toScheduleTimes(plan.times);
  const stockQty = plan.stockQty ? plan.stockQty.toNumber() : null;
  const daysLeft = plan.isActive ? stockDaysLeft(stockQty, times) : null;
  return {
    id: plan.id,
    medicineId: plan.medicineId,
    prescriptionItemId: plan.prescriptionItemId,
    displayName: plan.displayName,
    genericName: plan.medicine?.genericName ?? null,
    doseUnit: plan.doseUnit as DoseUnit,
    mealTiming: plan.mealTiming as MealTiming,
    mealOffsetMin: plan.mealOffsetMin,
    startDate: dateColumnToString(plan.startDate),
    endDate: plan.endDate ? dateColumnToString(plan.endDate) : null,
    isActive: plan.isActive,
    times: plan.times.map((time) => ({
      id: time.id,
      time: timeColumnToHhmm(time.timeOfDay),
      dose: time.dose.toNumber(),
      days: daysFromMask(time.daysMask),
    })),
    pattern: dosePattern(times),
    stockQty,
    stockDaysLeft: daysLeft,
    lowStock: daysLeft !== null && daysLeft <= plan.refillAlertDays,
    refillAlertDays: plan.refillAlertDays,
    createdAt: plan.createdAt.toISOString(),
  };
}
