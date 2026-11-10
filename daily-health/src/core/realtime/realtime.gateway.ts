import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
} from '@nestjs/websockets';
import type { DefaultEventsMap, Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeTicketsService } from './realtime-tickets.service.js';
import { RealtimeService, userRoom } from './realtime.service.js';

export interface RealtimeSocketData {
  userId?: string;
}

/** A connected client; `data.userId` is set once its ticket was accepted. */
export type RealtimeSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  RealtimeSocketData
>;

/**
 * The single Socket.io endpoint (`/socket.io`). A client proves who it is with
 * a one-time ticket (`auth.ticket`) and joins its own `user:<id>` room; modules
 * then reach users through RealtimeService. Feature gateways (chat typing) run
 * on the same server and read `socket.data.userId`.
 */
@WebSocketGateway()
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly tickets: RealtimeTicketsService,
    private readonly realtime: RealtimeService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server): void {
    this.realtime.attach(server);
  }

  async handleConnection(socket: RealtimeSocket): Promise<void> {
    const auth = socket.handshake.auth as { ticket?: unknown } | undefined;
    const userId = await this.tickets.consume(auth?.ticket).catch(() => null);
    const active = userId
      ? await this.prisma.user.findFirst({
          where: { id: userId, status: 'ACTIVE' },
          select: { id: true },
        })
      : null;
    if (!userId || !active) {
      socket.emit('realtime:error', { code: 'REALTIME_TICKET_INVALID' });
      socket.disconnect(true);
      return;
    }
    socket.data.userId = userId;
    await socket.join(userRoom(userId));
    this.realtime.markConnected(userId);
    socket.emit('realtime:ready', {});
    this.logger.debug('socket connected');
  }

  handleDisconnect(socket: RealtimeSocket): void {
    if (socket.data.userId) this.realtime.markDisconnected(socket.data.userId);
  }
}
