import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  CurrentUser,
  PublicRoute,
  RegisteredUsersOnly,
} from '../../common/auth/auth-route.decorators.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { AdminOnly } from '../../common/auth/staff-role.guard.js';
import { UuidParam } from '../../common/pipes/uuid-param.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiZodBody } from '../../common/swagger/api-zod-body.decorator.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import {
  applicableCouponsQuerySchema,
  checkCouponRequestSchema,
  type ApplicableCouponResponse,
  type ApplicableCouponsQuery,
  createCouponRequestSchema,
  listCouponsQuerySchema,
  updateCouponRequestSchema,
  type AdminCouponResponse,
  type CheckCouponRequest,
  type CheckCouponResponse,
  type CreateCouponRequest,
  type ListCouponsQuery,
  type MyCouponResponse,
  type UpdateCouponRequest,
} from '../../shared-contracts/payments.contract.js';
import { CouponsService } from './coupons.service.js';

@ApiTags('coupons')
@Controller('coupons')
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @PublicRoute()
  // Tight per-IP limit: the answer tells whether a code exists.
  @Throttle({ default: { limit: 10, ttl: 10 * 60_000 } })
  @Post('check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Is this coupon code usable now? (sign-up form)' })
  @ApiZodBody(checkCouponRequestSchema)
  check(
    @Body(new ZodValidationPipe(checkCouponRequestSchema)) body: CheckCouponRequest,
  ): Promise<CheckCouponResponse> {
    return this.coupons.check(body.code);
  }

  @ApiBearerAuth()
  @RegisteredUsersOnly()
  @Get('applicable')
  @ApiOperation({ summary: 'My coupons for one checkout, with what each takes off' })
  applicable(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(applicableCouponsQuerySchema)) query: ApplicableCouponsQuery,
  ): Promise<ApplicableCouponResponse[]> {
    return this.coupons.applicable(user.userId, query);
  }

  @ApiBearerAuth()
  @RegisteredUsersOnly()
  @Get('mine')
  @ApiOperation({ summary: 'Coupons I have claimed' })
  mine(@CurrentUser() user: AuthenticatedUser): Promise<MyCouponResponse[]> {
    return this.coupons.mine(user.userId);
  }
}

@ApiTags('admin: coupons')
@ApiBearerAuth()
@RegisteredUsersOnly()
@AdminOnly()
@Controller('admin/coupons')
export class AdminCouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  @ApiOperation({ summary: 'Coupons, newest first (q: part of the code)' })
  list(
    @Query(new ZodValidationPipe(listCouponsQuerySchema)) query: ListCouponsQuery,
  ): Promise<PaginatedResponse<AdminCouponResponse>> {
    return this.coupons.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a coupon' })
  @ApiZodBody(createCouponRequestSchema)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createCouponRequestSchema)) body: CreateCouponRequest,
  ): Promise<AdminCouponResponse> {
    return this.coupons.create(user.userId, body);
  }

  @Patch(':couponId')
  @ApiOperation({ summary: 'Change a coupon (not its code); isActive=false switches it off' })
  @ApiZodBody(updateCouponRequestSchema)
  update(
    @UuidParam('couponId') couponId: string,
    @Body(new ZodValidationPipe(updateCouponRequestSchema)) body: UpdateCouponRequest,
  ): Promise<AdminCouponResponse> {
    return this.coupons.update(couponId, body);
  }
}
