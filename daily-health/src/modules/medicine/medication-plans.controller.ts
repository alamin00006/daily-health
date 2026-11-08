import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import {
  CurrentUser,
  RegisteredUsersOnly,
} from '../../common/auth/auth-route.decorators.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { UuidParam } from '../../common/pipes/uuid-param.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiZodBody } from '../../common/swagger/api-zod-body.decorator.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import {
  createMedicationPlanRequestSchema,
  listMedicationPlansQuerySchema,
  restockRequestSchema,
  updateMedicationPlanRequestSchema,
  type CreateMedicationPlanRequest,
  type MedicationPlanResponse,
  type RestockRequest,
  type UpdateMedicationPlanRequest,
} from '../../shared-contracts/medicine.contract.js';
import {
  ProfileAction,
  type ProfileAccess,
} from '../users/profile-access.service.js';
import {
  CurrentProfileAccess,
  RequireProfileAccess,
} from '../users/require-profile-access.guard.js';
import { MedicationPlansService } from './medication-plans.service.js';

@ApiTags('medicine: plans')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('profiles/:profileId/medication-plans')
export class MedicationPlansController {
  constructor(private readonly plans: MedicationPlansService) {}

  @Post()
  @RequireProfileAccess(ProfileAction.EDIT)
  @ApiOperation({
    summary:
      'Add a medicine with its daily times and doses, e.g. 08:00 × 1 and 21:00 × ½ (OWNER, CAREGIVER)',
  })
  @ApiZodBody(createMedicationPlanRequestSchema)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @Body(new ZodValidationPipe(createMedicationPlanRequestSchema))
    body: CreateMedicationPlanRequest,
  ): Promise<MedicationPlanResponse> {
    return this.plans.create(user.userId, access, body);
  }

  @Get()
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({
    summary:
      'Medicines with times (the app schedules its local alarms from these)',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @Query(new ZodValidationPipe(listMedicationPlansQuerySchema))
    query: z.output<typeof listMedicationPlansQuerySchema>,
  ): Promise<PaginatedResponse<MedicationPlanResponse>> {
    return this.plans.list(user.userId, access, query.includeStopped);
  }

  @Get(':planId')
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({ summary: 'One medicine' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('planId') planId: string,
  ): Promise<MedicationPlanResponse> {
    return this.plans.get(user.userId, access, planId);
  }

  @Patch(':planId')
  @RequireProfileAccess(ProfileAction.EDIT)
  @ApiOperation({
    summary:
      'Change name, times, doses, end date or stock; upcoming doses are rebuilt (OWNER, CAREGIVER)',
  })
  @ApiZodBody(updateMedicationPlanRequestSchema)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('planId') planId: string,
    @Body(new ZodValidationPipe(updateMedicationPlanRequestSchema))
    body: UpdateMedicationPlanRequest,
  ): Promise<MedicationPlanResponse> {
    return this.plans.update(user.userId, access, planId, body);
  }

  @Post(':planId/restock')
  @RequireProfileAccess(ProfileAction.EDIT)
  @ApiOperation({ summary: 'Bought more: add to the stock (OWNER, CAREGIVER)' })
  @ApiZodBody(restockRequestSchema)
  restock(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('planId') planId: string,
    @Body(new ZodValidationPipe(restockRequestSchema)) body: RestockRequest,
  ): Promise<MedicationPlanResponse> {
    return this.plans.restock(user.userId, access, planId, body);
  }

  @Post(':planId/stop')
  @RequireProfileAccess(ProfileAction.EDIT)
  @ApiOperation({
    summary: 'Stop taking it; history and adherence stay (OWNER, CAREGIVER)',
  })
  stop(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('planId') planId: string,
  ): Promise<MedicationPlanResponse> {
    return this.plans.stop(user.userId, access, planId);
  }

  @Delete(':planId')
  @RequireProfileAccess(ProfileAction.EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Added by mistake: delete with its history (OWNER, CAREGIVER)',
  })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('planId') planId: string,
  ): Promise<void> {
    return this.plans.remove(user.userId, access, planId);
  }
}
