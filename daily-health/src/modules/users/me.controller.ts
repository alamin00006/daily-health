import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/auth-route.decorators.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { MeResponse } from '../../shared-contracts/profiles.contract.js';
import { UserAccountsService } from '../auth/user-accounts.service.js';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(
    private readonly accounts: UserAccountsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'The logged-in account (guests too)' })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<MeResponse> {
    const [account, ownProfile] = await Promise.all([
      this.accounts.findById(user.userId),
      this.prisma.patientProfile.findFirst({
        where: { linkedUserId: user.userId, deletedAt: null },
        select: { id: true },
      }),
    ]);
    return {
      id: user.userId,
      email: account?.email ?? null,
      role: user.role,
      isGuest: user.isGuest,
      ownProfileId: ownProfile?.id ?? null,
    };
  }
}
