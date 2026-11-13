import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/auth-route.decorators.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { AdminOnly } from '../../common/auth/staff-role.guard.js';
import { UuidParam } from '../../common/pipes/uuid-param.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiZodBody } from '../../common/swagger/api-zod-body.decorator.js';
import {
  addStaffRequestSchema,
  listAdminUsersQuerySchema,
  listAuditLogsQuerySchema,
  updateAdminUserRequestSchema,
  updateStaffRequestSchema,
  type AddStaffRequest,
  type AdminDashboardResponse,
  type AdminUserResponse,
  type AuditLogResponse,
  type ListAdminUsersQuery,
  type ListAuditLogsQuery,
  type StaffMemberResponse,
  type UpdateAdminUserRequest,
  type UpdateStaffRequest,
} from '../../shared-contracts/admin.contract.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import { AdminDashboardService } from './admin-dashboard.service.js';
import { AuditLogsService } from './audit-logs.service.js';
import { StaffAndUsersService } from './staff-and-users.service.js';

@ApiTags('admin')
@ApiBearerAuth()
@AdminOnly()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly dashboard: AdminDashboardService,
    private readonly audit: AuditLogsService,
    private readonly people: StaffAndUsersService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Counts for the admin home page' })
  getDashboard(): Promise<AdminDashboardResponse> {
    return this.dashboard.get();
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'Health-data access log (filter by patient ID, actor email, action prefix)' })
  auditLogs(
    @Query(new ZodValidationPipe(listAuditLogsQuerySchema)) query: ListAuditLogsQuery,
  ): Promise<PaginatedResponse<AuditLogResponse>> {
    return this.audit.list(query);
  }

  @Get('users')
  @ApiOperation({ summary: 'Accounts, newest first' })
  users(
    @Query(new ZodValidationPipe(listAdminUsersQuerySchema)) query: ListAdminUsersQuery,
  ): Promise<PaginatedResponse<AdminUserResponse>> {
    return this.people.listUsers(query);
  }

  @Patch('users/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Suspend (ends all sessions) or reactivate an account' })
  @ApiZodBody(updateAdminUserRequestSchema)
  updateUser(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('userId') userId: string,
    @Body(new ZodValidationPipe(updateAdminUserRequestSchema)) body: UpdateAdminUserRequest,
  ): Promise<void> {
    return this.people.updateUser(user.userId, userId, body);
  }

  @Get('staff')
  @ApiOperation({ summary: 'Moderators and admins' })
  staff(): Promise<StaffMemberResponse[]> {
    return this.people.listStaff();
  }

  @Post('staff')
  @ApiOperation({ summary: 'Make an existing account a moderator or admin (gets a staff ID)' })
  @ApiZodBody(addStaffRequestSchema)
  addStaff(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(addStaffRequestSchema)) body: AddStaffRequest,
  ): Promise<StaffMemberResponse[]> {
    return this.people.addStaff(user.userId, body);
  }

  @Patch('staff/:userId')
  @ApiOperation({ summary: 'Rename, or switch between moderator and admin' })
  @ApiZodBody(updateStaffRequestSchema)
  updateStaff(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('userId') userId: string,
    @Body(new ZodValidationPipe(updateStaffRequestSchema)) body: UpdateStaffRequest,
  ): Promise<StaffMemberResponse[]> {
    return this.people.updateStaff(user.userId, userId, body);
  }

  @Delete('staff/:userId')
  @ApiOperation({ summary: 'Back to a normal account (the staff ID is kept for history)' })
  removeStaff(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('userId') userId: string,
  ): Promise<StaffMemberResponse[]> {
    return this.people.removeStaff(user.userId, userId);
  }
}
