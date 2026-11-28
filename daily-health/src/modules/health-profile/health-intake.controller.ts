import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  RegisteredUsersOnly,
} from '../../common/auth/auth-route.decorators.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiZodBody } from '../../common/swagger/api-zod-body.decorator.js';
import {
  healthIntakeRequestSchema,
  type HealthIntakeRequest,
} from '../../shared-contracts/health.contract.js';
import type { PatientProfileResponse } from '../../shared-contracts/profiles.contract.js';
import {
  ProfileAction,
  type ProfileAccess,
} from '../users/profile-access.service.js';
import {
  CurrentProfileAccess,
  RequireProfileAccess,
} from '../users/require-profile-access.guard.js';
import { MedicalConditionsService } from './medical-conditions.service.js';

@ApiTags('health profile: complete your profile')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('profiles/:profileId/health-intake')
export class HealthIntakeController {
  constructor(private readonly conditions: MedicalConditionsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @RequireProfileAccess(ProfileAction.EDIT)
  @ApiOperation({
    summary:
      'Complete the profile: name, gender, birth date and long-term illnesses (or none). Can be sent again (OWNER, CAREGIVER)',
  })
  @ApiZodBody(healthIntakeRequestSchema)
  intake(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProfileAccess() access: ProfileAccess,
    @Body(new ZodValidationPipe(healthIntakeRequestSchema)) body: HealthIntakeRequest,
  ): Promise<PatientProfileResponse> {
    return this.conditions.intake(user.userId, access, body);
  }
}
