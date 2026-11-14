import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception.js';
import { addDays, dhakaDate, stringToDateColumn } from '../../common/time/dhaka-time.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { DietPlan } from '../../generated/prisma/client.js';
import type { DietDayResponse, DietPlanResponse } from '../../shared-contracts/nutrition.contract.js';
import type { ProfileAccess } from '../users/profile-access.service.js';
import { DietPlanViewsService, NutritionErrorCode, planNotFound } from './diet-plan-views.service.js';

/** How far back a day can still be filled in (people forget to tick the evening meal). */
const EDITABLE_DAYS = 7;

/** The family's side: plans, and each day's meals and water. */
@Injectable()
export class PatientDietService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly views: DietPlanViewsService,
  ) {}

  /** Published plans (no drafts), active first, then newest. */
  async plans(access: ProfileAccess): Promise<DietPlanResponse[]> {
    const rows = await this.prisma.dietPlan.findMany({
      where: { patientId: access.profile.id, status: { in: ['ACTIVE', 'ENDED'] } },
      include: { meals: true },
      orderBy: [{ status: 'asc' }, { publishedAt: 'desc' }],
      take: 30,
    });
    return this.views.plans(rows);
  }

  async plan(access: ProfileAccess, planId: string): Promise<DietPlanResponse> {
    const row = await this.prisma.dietPlan.findFirst({
      where: { id: planId, patientId: access.profile.id, status: { in: ['ACTIVE', 'ENDED'] } },
      include: { meals: true },
    });
    if (!row) throw planNotFound();
    return (await this.views.plans([row]))[0];
  }

  async day(access: ProfileAccess, date: string): Promise<DietDayResponse> {
    const patientId = access.profile.id;
    const log = await this.prisma.intakeLog.findUnique({
      where: { patientId_date: { patientId, date: stringToDateColumn(date) } },
      include: { checks: true },
    });
    const plan = await this.planOn(patientId, date, log?.dietPlanId ?? null);
    const meals = plan
      ? await this.prisma.dietPlanMeal.findMany({ where: { dietPlanId: plan.id }, orderBy: { sortOrder: 'asc' } })
      : [];
    const followed = new Set((log?.checks ?? []).filter((c) => c.followed).map((c) => c.mealId));
    const planView = plan ? (await this.views.plans([{ ...plan, meals: [] }]))[0] : null;
    return {
      date,
      plan: planView ? (({ meals: _meals, ...rest }) => rest)(planView) : null,
      meals: meals.map((m) => ({ ...this.views.meal(m), followed: followed.has(m.id) })),
      caloriesKcal: log?.caloriesKcal ?? 0,
      waterMl: log?.waterMl ?? 0,
    };
  }

  async setMealFollowed(userId: string, access: ProfileAccess, date: string, mealId: string, followed: boolean): Promise<DietDayResponse> {
    assertEditable(date);
    const patientId = access.profile.id;
    const plan = await this.planOn(patientId, date, null);
    const meal = plan ? await this.prisma.dietPlanMeal.findFirst({ where: { id: mealId, dietPlanId: plan.id } }) : null;
    if (!plan || !meal) {
      throw new AppException(NutritionErrorCode.DIET_MEAL_NOT_FOUND, 'No such meal in the plan for that day', HttpStatus.NOT_FOUND);
    }
    await this.prisma.$transaction(async (tx) => {
      const log = await tx.intakeLog.upsert({
        where: { patientId_date: { patientId, date: stringToDateColumn(date) } },
        create: { patientId, date: stringToDateColumn(date), dietPlanId: plan.id, updatedByUserId: userId },
        update: { dietPlanId: plan.id, updatedByUserId: userId },
      });
      await tx.mealCheck.upsert({
        where: { intakeLogId_mealId: { intakeLogId: log.id, mealId } },
        create: { intakeLogId: log.id, mealId, followed },
        update: { followed },
      });
      // Calories come from the followed meals' estimates.
      const checks = await tx.mealCheck.findMany({ where: { intakeLogId: log.id, followed: true }, include: { meal: true } });
      const calories = checks.reduce((sum, c) => sum + (c.meal.approxKcal ?? 0), 0);
      await tx.intakeLog.update({ where: { id: log.id }, data: { caloriesKcal: calories } });
    });
    return this.day(access, date);
  }

  async setWater(userId: string, access: ProfileAccess, date: string, waterMl: number): Promise<DietDayResponse> {
    assertEditable(date);
    const patientId = access.profile.id;
    const plan = await this.planOn(patientId, date, null);
    await this.prisma.intakeLog.upsert({
      where: { patientId_date: { patientId, date: stringToDateColumn(date) } },
      create: { patientId, date: stringToDateColumn(date), dietPlanId: plan?.id ?? null, waterMl, updatedByUserId: userId },
      update: { waterMl, updatedByUserId: userId },
    });
    return this.day(access, date);
  }

  /** The plan logged that day, else the published plan whose dates cover it (active first). */
  private async planOn(patientId: string, date: string, loggedPlanId: string | null): Promise<DietPlan | null> {
    if (loggedPlanId) {
      const logged = await this.prisma.dietPlan.findUnique({ where: { id: loggedPlanId } });
      if (logged) return logged;
    }
    const day = stringToDateColumn(date);
    return this.prisma.dietPlan.findFirst({
      where: {
        patientId,
        status: { in: ['ACTIVE', 'ENDED'] },
        startDate: { lte: day },
        OR: [{ endDate: null }, { endDate: { gte: day } }],
      },
      orderBy: [{ status: 'asc' }, { publishedAt: 'desc' }],
    });
  }
}

function assertEditable(date: string): void {
  const today = dhakaDate();
  if (date > today || date < addDays(today, -EDITABLE_DAYS)) {
    throw new AppException(
      NutritionErrorCode.DIET_DAY_NOT_EDITABLE,
      `Only today and the last ${EDITABLE_DAYS} days can be filled in`,
      HttpStatus.CONFLICT,
    );
  }
}
