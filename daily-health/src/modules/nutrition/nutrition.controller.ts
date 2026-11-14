import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RegisteredUsersOnly } from '../../common/auth/auth-route.decorators.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { UuidParam } from '../../common/pipes/uuid-param.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiZodBody } from '../../common/swagger/api-zod-body.decorator.js';
import { calendarDateSchema, type PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import {
  createDietPlanRequestSchema,
  listProviderDietPlansQuerySchema,
  setMealFollowedRequestSchema,
  setWaterRequestSchema,
  updateDietPlanRequestSchema,
  type CreateDietPlanRequest,
  type DietDayResponse,
  type DietPlanCandidateResponse,
  type DietPlanResponse,
  type ListProviderDietPlansQuery,
  type ProviderDietPlanResponse,
  type SetMealFollowedRequest,
  type SetWaterRequest,
  type UpdateDietPlanRequest,
} from '../../shared-contracts/nutrition.contract.js';
import { ProfileAction, type ProfileAccess } from '../users/profile-access.service.js';
import { CurrentProfileAccess, RequireProfileAccess } from '../users/require-profile-access.guard.js';
import { PatientDietService } from './patient-diet.service.js';
import { ProviderDietPlansService } from './provider-diet-plans.service.js';

const dateParam = new ZodValidationPipe(calendarDateSchema);

@ApiTags('nutrition: provider')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('provider/me/diet-plans')
export class ProviderDietPlansController {
  constructor(private readonly plans: ProviderDietPlansService) {}

  @Get()
  @ApiOperation({ summary: 'My diet plans, newest first' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listProviderDietPlansQuerySchema)) query: ListProviderDietPlansQuery,
  ): Promise<PaginatedResponse<ProviderDietPlanResponse>> {
    return this.plans.list(user.userId, query);
  }

  @Get('candidates')
  @ApiOperation({ summary: 'My recent visits (60 days) to write a plan for' })
  candidates(@CurrentUser() user: AuthenticatedUser): Promise<DietPlanCandidateResponse[]> {
    return this.plans.candidates(user.userId);
  }

  @Get(':planId')
  get(@CurrentUser() user: AuthenticatedUser, @UuidParam('planId') planId: string): Promise<ProviderDietPlanResponse> {
    return this.plans.get(user.userId, planId);
  }

  @Post()
  @ApiOperation({ summary: 'New plan (a draft) for one of my confirmed or completed visits' })
  @ApiZodBody(createDietPlanRequestSchema)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createDietPlanRequestSchema)) body: CreateDietPlanRequest,
  ): Promise<ProviderDietPlanResponse> {
    return this.plans.create(user.userId, body);
  }

  @Put(':planId')
  @ApiOperation({ summary: 'Replace the plan (meals too); draft or active' })
  @ApiZodBody(updateDietPlanRequestSchema)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('planId') planId: string,
    @Body(new ZodValidationPipe(updateDietPlanRequestSchema)) body: UpdateDietPlanRequest,
  ): Promise<ProviderDietPlanResponse> {
    return this.plans.update(user.userId, planId, body);
  }

  @Post(':planId/publish')
  @ApiOperation({ summary: 'Give it to the patient (their previous active plan ends)' })
  publish(@CurrentUser() user: AuthenticatedUser, @UuidParam('planId') planId: string): Promise<ProviderDietPlanResponse> {
    return this.plans.publish(user.userId, planId);
  }

  @Post(':planId/end')
  end(@CurrentUser() user: AuthenticatedUser, @UuidParam('planId') planId: string): Promise<ProviderDietPlanResponse> {
    return this.plans.end(user.userId, planId);
  }

  @Delete(':planId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a draft' })
  remove(@CurrentUser() user: AuthenticatedUser, @UuidParam('planId') planId: string): Promise<void> {
    return this.plans.remove(user.userId, planId);
  }
}

@ApiTags('nutrition')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('profiles/:profileId')
export class ProfileDietController {
  constructor(private readonly diet: PatientDietService) {}

  @Get('diet-plans')
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({ summary: 'Diet plans given to the profile (active first)' })
  plans(@CurrentProfileAccess() access: ProfileAccess): Promise<DietPlanResponse[]> {
    return this.diet.plans(access);
  }

  @Get('diet-plans/:planId')
  @RequireProfileAccess(ProfileAction.VIEW)
  plan(@CurrentProfileAccess() access: ProfileAccess, @UuidParam('planId') planId: string): Promise<DietPlanResponse> {
    return this.diet.plan(access, planId);
  }

  @Get('diet/days/:date')
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({ summary: "A day's meals (followed or not), calories and water" })
  day(@CurrentProfileAccess() access: ProfileAccess, @Param('date', dateParam) date: string): Promise<DietDayResponse> {
    return this.diet.day(access, date);
  }

  @Put('diet/days/:date/meals/:mealId')
  @RequireProfileAccess(ProfileAction.EDIT)
  @ApiOperation({ summary: 'Mark a meal followed or not (today and the last 7 days)' })
  @ApiZodBody(setMealFollowedRequestSchema)
  setMeal(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @Param('date', dateParam) date: string,
    @UuidParam('mealId') mealId: string,
    @Body(new ZodValidationPipe(setMealFollowedRequestSchema)) body: SetMealFollowedRequest,
  ): Promise<DietDayResponse> {
    return this.diet.setMealFollowed(user.userId, access, date, mealId, body.followed);
  }

  @Put('diet/days/:date/water')
  @RequireProfileAccess(ProfileAction.EDIT)
  @ApiOperation({ summary: "Set the day's water (ml)" })
  @ApiZodBody(setWaterRequestSchema)
  setWater(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @Param('date', dateParam) date: string,
    @Body(new ZodValidationPipe(setWaterRequestSchema)) body: SetWaterRequest,
  ): Promise<DietDayResponse> {
    return this.diet.setWater(user.userId, access, date, body.waterMl);
  }
}
