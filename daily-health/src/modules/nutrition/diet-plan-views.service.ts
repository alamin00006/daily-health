import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception.js';
import { dateColumnToString, timeColumnToHhmm } from '../../common/time/dhaka-time.js';
import type { DietPlan, DietPlanMeal } from '../../generated/prisma/client.js';
import type { DietMealResponse, DietPlanResponse } from '../../shared-contracts/nutrition.contract.js';
import { AppointmentLookupService } from '../appointments/appointment-lookup.service.js';
import { ProviderDirectoryService } from '../doctors/provider-directory.service.js';

export type PlanWithMeals = DietPlan & { meals: DietPlanMeal[] };

export const NutritionErrorCode = {
  DIET_PLAN_NOT_FOUND: 'DIET_PLAN_NOT_FOUND',
  /** Not this provider's confirmed or completed visit. */
  DIET_PLAN_APPOINTMENT_INVALID: 'DIET_PLAN_APPOINTMENT_INVALID',
  /** The visit already has a plan. */
  DIET_PLAN_EXISTS: 'DIET_PLAN_EXISTS',
  /** The plan is not in a state that allows this. */
  DIET_PLAN_STATUS_CONFLICT: 'DIET_PLAN_STATUS_CONFLICT',
  /** Days in the future, or older than a week, cannot be logged. */
  DIET_DAY_NOT_EDITABLE: 'DIET_DAY_NOT_EDITABLE',
  DIET_MEAL_NOT_FOUND: 'DIET_MEAL_NOT_FOUND',
} as const;

/** Builds plan responses (provider and appointment details from their modules). */
@Injectable()
export class DietPlanViewsService {
  constructor(
    private readonly directory: ProviderDirectoryService,
    private readonly appointments: AppointmentLookupService,
  ) {}

  meal(m: DietPlanMeal): DietMealResponse {
    return {
      id: m.id,
      mealType: m.mealType,
      time: timeColumnToHhmm(m.time),
      description: m.description,
      approxKcal: m.approxKcal,
      sortOrder: m.sortOrder,
    };
  }

  async plans(rows: PlanWithMeals[]): Promise<DietPlanResponse[]> {
    const [providers, appts] = await Promise.all([
      this.directory.summariesByIds(rows.map((r) => r.providerId)),
      this.appointments.findManyByIds(rows.map((r) => r.appointmentId)),
    ]);
    return rows.map((r) => {
      const p = providers.get(r.providerId);
      return {
        id: r.id,
        patientId: r.patientId,
        provider: p
          ? { id: p.id, type: p.type, displayName: p.displayName, designation: p.designation, avatarThumbnailUrl: p.avatarThumbnailUrl }
          : null,
        appointmentId: r.appointmentId,
        appointmentCode: appts.get(r.appointmentId)?.code ?? null,
        title: r.title,
        calorieTargetKcal: r.calorieTargetKcal,
        waterTargetMl: r.waterTargetMl,
        startDate: dateColumnToString(r.startDate),
        endDate: r.endDate ? dateColumnToString(r.endDate) : null,
        status: r.status,
        notes: r.notes,
        meals: [...r.meals].sort((a, b) => a.sortOrder - b.sortOrder).map((m) => this.meal(m)),
        publishedAt: r.publishedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    });
  }
}

export function planNotFound(): AppException {
  return new AppException(NutritionErrorCode.DIET_PLAN_NOT_FOUND, 'Diet plan not found', HttpStatus.NOT_FOUND);
}
