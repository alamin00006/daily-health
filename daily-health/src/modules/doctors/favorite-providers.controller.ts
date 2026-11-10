import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RegisteredUsersOnly } from '../../common/auth/auth-route.decorators.js';
import { UuidParam } from '../../common/pipes/uuid-param.decorator.js';
import type { FavoriteProviderResponse } from '../../shared-contracts/doctors.contract.js';
import {
  ProfileAction,
  type ProfileAccess,
} from '../users/profile-access.service.js';
import {
  CurrentProfileAccess,
  RequireProfileAccess,
} from '../users/require-profile-access.guard.js';
import { FavoriteProvidersService } from './favorite-providers.service.js';

@ApiTags('doctors: my doctors')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('profiles/:profileId/favorite-providers')
export class FavoriteProvidersController {
  constructor(private readonly favorites: FavoriteProvidersService) {}

  @Get()
  @RequireProfileAccess(ProfileAction.VIEW)
  @ApiOperation({ summary: '"My doctors" of this profile' })
  list(
    @CurrentProfileAccess() access: ProfileAccess,
  ): Promise<FavoriteProviderResponse[]> {
    return this.favorites.list(access);
  }

  @Put(':providerId')
  @RequireProfileAccess(ProfileAction.EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Add to my doctors (OWNER, CAREGIVER)' })
  add(
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('providerId') providerId: string,
  ): Promise<void> {
    return this.favorites.add(access, providerId);
  }

  @Delete(':providerId')
  @RequireProfileAccess(ProfileAction.EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove from my doctors (OWNER, CAREGIVER)' })
  remove(
    @CurrentProfileAccess() access: ProfileAccess,
    @UuidParam('providerId') providerId: string,
  ): Promise<void> {
    return this.favorites.remove(access, providerId);
  }
}
