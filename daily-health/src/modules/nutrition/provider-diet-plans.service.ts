import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppException } from '../../common/errors/app-exception.js';
import { emitAuditEvent } from '../../common/events/audit-event.js';
import { afterCursor, toKeysetPage } from '../../common/pagination/keyset-cursor.js';
import { dhakaDate, hhmmToTimeColumn, stringToDateColumn } from '../../common/time/dhaka-time.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import type {
  CreateDietPlanRequest,
  DietMealInput,
  DietPlanCandidateResponse,
  ListProviderDietPlansQuery,
  ProviderDietPlanResponse,
  UpdateDietPlanRequest,
} from '../../shared-contracts/nutrition.contract.js';
import { AppointmentLookupService } from '../appointments/appointment-lookup.service.js';
import { ProviderDirectoryService } from '../doctors/provider-directory.service.js';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service.js';
import { PatientProfilesService } from '../users/patient-profiles.service.js';
import { DietPlanViewsService, NutritionErrorCode, planNotFound, type PlanWithMeals } from './diet-plan-views.service.js';

const CANDIDATE_DAYS = 60;
const MEAL_ORDER = { BREAKFAST: 0, LUNCH: 1, SNACKS: 2, DINNER: 3 } as const;

/**
 * Diet plans written by a provider for one of their visits: DRAFT → ACTIVE (the
 * family is told; a patient's previous active plan ends) → ENDED.
 */
@Injectable()
export class ProviderDietPlansService {
  private readonly logger = new Logger(ProviderDietPlansService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly directory: ProviderDirectoryService,
    private readonly appointments: AppointmentLookupService,
    private readonly profiles: PatientProfilesService,
    private readonly views: DietPlanViewsService,
    private readonly delivery: NotificationDeliveryService,
    private readonly events: EventEmitter2,
  ) {}

  async list(userId: string, query: ListProviderDietPlansQuery): Promise<PaginatedResponse<ProviderDietPlanResponse>> {
    const provider = await this.directory.requireOwn(userId);
    const rows = await this.prisma.dietPlan.findMany({
      where: { providerId: provider.id, ...(query.status ? { status: query.status } : {}), ...afterCursor('createdAt', query.cursor) },
      include: { meals: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = toKeysetPage(rows, query.limit, (r) => r.createdAt, (r) => r);
    return { data: await this.withPatients(page.data), meta: page.meta };
  }

  /** Recent confirmed or completed visits, with the plan already written for each. */
  async candidates(userId: string): Promise<DietPlanCandidateResponse[]> {
    const provider = await this.directory.requireOwn(userId);
    const since = new Date(Date.now() - CANDIDATE_DAYS * 24 * 3_600_000);
    const visits = await this.appointments.recentForProvider(provider.id, since);
    const [plans, profiles] = await Promise.all([
      this.prisma.dietPlan.findMany({ where: { appointmentId: { in: visits.map((v) => v.id) } }, select: { id: true, appointmentId: true } }),
      this.profiles.findManyByIds(visits.map((v) => v.patientId)),
    ]);
    return visits.map((v) => ({
      appointmentId: v.id,
      appointmentCode: v.code,
      scheduledAt: v.scheduledAt.toISOString(),
      patientId: v.patientId,
      patientName: profiles.get(v.patientId)?.fullName ?? null,
      patientCode: profiles.get(v.patientId)?.patientCode ?? null,
      existingPlanId: plans.find((p) => p.appointmentId === v.id)?.id ?? null,
    }));
  }

  async get(userId: string, planId: string): Promise<ProviderDietPlanResponse> {
    const plan = await this.requireOwnPlan(userId, planId);
    this.audit(userId, plan, 'nutrition.plan.provider.view');
    return (await this.withPatients([plan]))[0];
  }

  async create(userId: string, input: CreateDietPlanRequest): Promise<ProviderDietPlanResponse> {
    const provider = await this.directory.requireOwn(userId);
    const visit = await this.appointments.findById(input.appointmentId);
    if (!visit || visit.providerId !== provider.id || !['CONFIRMED', 'COMPLETED'].includes(visit.status)) {
      throw new AppException(
        NutritionErrorCode.DIET_PLAN_APPOINTMENT_INVALID,
        'Write a plan for one of your confirmed or completed visits',
        HttpStatus.CONFLICT,
      );
    }
    if (await this.prisma.dietPlan.findUnique({ where: { appointmentId: visit.id } })) {
      throw new AppException(NutritionErrorCode.DIET_PLAN_EXISTS, 'This visit already has a plan', HttpStatus.CONFLICT);
    }
    const plan = await this.prisma.dietPlan.create({
      data: {
        patientId: visit.patientId,
        providerId: provider.id,
        appointmentId: visit.id,
        ...planData(input),
        meals: { create: mealRows(input.meals) },
      },
      include: { meals: true },
    });
    this.audit(userId, plan, 'nutrition.plan.create');
    return (await this.withPatients([plan]))[0];
  }

  /** Replaces the whole plan (meals too). An ACTIVE plan can still be corrected. */
  async update(userId: string, planId: string, input: UpdateDietPlanRequest): Promise<ProviderDietPlanResponse> {
    const plan = await this.requireOwnPlan(userId, planId);
    if (plan.status === 'ENDED') throw statusConflict('An ended plan cannot be changed');
    const updated = await this.prisma.$transaction(async (tx) => {
      // Day logs keep their checks only for meals that still exist.
      await tx.dietPlanMeal.deleteMany({ where: { dietPlanId: planId } });
      return tx.dietPlan.update({
        where: { id: planId },
        data: { ...planData(input), meals: { create: mealRows(input.meals) } },
        include: { meals: true },
      });
    });
    this.audit(userId, updated, 'nutrition.plan.update');
    return (await this.withPatients([updated]))[0];
  }

  /** DRAFT → ACTIVE. The patient's other active plan ends the day before this one starts. */
  async publish(userId: string, planId: string): Promise<ProviderDietPlanResponse> {
    const plan = await this.requireOwnPlan(userId, planId);
    if (plan.status !== 'DRAFT') throw statusConflict('Only a draft can be published');
    const updated = await this.prisma.$transaction(async (tx) => {
      const today = dhakaDate();
      await tx.dietPlan.updateMany({
        where: { patientId: plan.patientId, status: 'ACTIVE' },
        data: { status: 'ENDED', endDate: stringToDateColumn(today) },
      });
      return tx.dietPlan.update({
        where: { id: planId },
        data: { status: 'ACTIVE', publishedAt: new Date() },
        include: { meals: true },
      });
    });
    await this.notifyFamily(updated);
    return (await this.withPatients([updated]))[0];
  }

  async end(userId: string, planId: string): Promise<ProviderDietPlanResponse> {
    const plan = await this.requireOwnPlan(userId, planId);
    if (plan.status !== 'ACTIVE') throw statusConflict('Only an active plan can be ended');
    const today = stringToDateColumn(dhakaDate());
    const updated = await this.prisma.dietPlan.update({
      where: { id: planId },
      data: { status: 'ENDED', endDate: plan.endDate && plan.endDate < today ? plan.endDate : today },
      include: { meals: true },
    });
    return (await this.withPatients([updated]))[0];
  }

  /** A draft that was never published can be thrown away. */
  async remove(userId: string, planId: string): Promise<void> {
    const plan = await this.requireOwnPlan(userId, planId);
    if (plan.status !== 'DRAFT') throw statusConflict('Only a draft can be deleted');
    await this.prisma.dietPlan.delete({ where: { id: planId } });
  }

  // -------------------------------------------------------------------------

  private async requireOwnPlan(userId: string, planId: string): Promise<PlanWithMeals> {
    const provider = await this.directory.requireOwn(userId);
    const plan = await this.prisma.dietPlan.findFirst({ where: { id: planId, providerId: provider.id }, include: { meals: true } });
    if (!plan) throw planNotFound();
    return plan;
  }

  private async withPatients(rows: PlanWithMeals[]): Promise<ProviderDietPlanResponse[]> {
    const [base, profiles] = await Promise.all([this.views.plans(rows), this.profiles.findManyByIds(rows.map((r) => r.patientId))]);
    return base.map((b) => ({
      ...b,
      patientName: profiles.get(b.patientId)?.fullName ?? null,
      patientCode: profiles.get(b.patientId)?.patientCode ?? null,
    }));
  }

  private async notifyFamily(plan: PlanWithMeals): Promise<void> {
    const visit = await this.appointments.findById(plan.appointmentId);
    if (!visit) return;
    try {
      await this.delivery.deliver([
        {
          userId: visit.bookedByUserId,
          patientId: plan.patientId,
          type: 'nutrition.plan',
          title: 'নতুন ডায়েট চার্ট',
          body: 'পুষ্টিবিদ ডায়েট চার্ট দিয়েছেন। অ্যাপে দেখুন।',
          data: { screen: 'diet', profileId: plan.patientId },
          channels: ['PUSH', 'IN_APP'],
        },
      ]);
    } catch (error) {
      this.logger.warn(`Diet plan notification failed: ${(error as Error).message}`);
    }
  }

  private audit(userId: string, plan: { id: string; patientId: string }, action: string): void {
    emitAuditEvent(this.events, { actorUserId: userId, patientId: plan.patientId, action, entityType: 'DietPlan', entityId: plan.id });
  }
}

function planData(input: UpdateDietPlanRequest): Omit<Prisma.DietPlanUncheckedCreateInput, 'patientId' | 'providerId' | 'appointmentId'> {
  return {
    title: input.title,
    calorieTargetKcal: input.calorieTargetKcal,
    waterTargetMl: input.waterTargetMl,
    startDate: stringToDateColumn(input.startDate),
    endDate: input.endDate ? stringToDateColumn(input.endDate) : null,
    notes: input.notes,
  };
}

/** Meals in the day's order (breakfast first), then as written. */
function mealRows(meals: DietMealInput[]) {
  return [...meals]
    .map((m, i) => ({ m, i }))
    .sort((a, b) => MEAL_ORDER[a.m.mealType] - MEAL_ORDER[b.m.mealType] || a.m.time.localeCompare(b.m.time) || a.i - b.i)
    .map(({ m }, sortOrder) => ({
      mealType: m.mealType,
      time: hhmmToTimeColumn(m.time),
      description: m.description,
      approxKcal: m.approxKcal,
      sortOrder,
    }));
}

function statusConflict(message: string): AppException {
  return new AppException(NutritionErrorCode.DIET_PLAN_STATUS_CONFLICT, message, HttpStatus.CONFLICT);
}
