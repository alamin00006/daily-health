import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  RegisteredUsersOnly,
} from '../../common/auth/auth-route.decorators.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import type { RealtimeTicketResponse } from '../../shared-contracts/realtime.contract.js';
import { RealtimeTicketsService } from './realtime-tickets.service.js';

@ApiTags('realtime')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('realtime')
export class RealtimeController {
  constructor(private readonly tickets: RealtimeTicketsService) {}

  @Post('ticket')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'One-time ticket (60 s) for the Socket.io handshake: io(origin, { auth: { ticket } })',
  })
  ticket(@CurrentUser() user: AuthenticatedUser): Promise<RealtimeTicketResponse> {
    return this.tickets.issue(user.userId);
  }
}
