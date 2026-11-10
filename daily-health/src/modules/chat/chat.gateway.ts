import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { z } from 'zod';
import type { RealtimeSocket } from '../../core/realtime/realtime.gateway.js';
import { REALTIME_EVENTS } from '../../shared-contracts/realtime.contract.js';
import { ChatService } from './chat.service.js';

const typingSchema = z.object({ conversationId: z.uuid() });

/** Client → server chat events on the shared Socket.io server (only typing; messages go over REST). */
@WebSocketGateway()
export class ChatGateway {
  constructor(private readonly chat: ChatService) {}

  @SubscribeMessage(REALTIME_EVENTS.CHAT_TYPING)
  async typing(
    @ConnectedSocket() socket: RealtimeSocket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    const userId = socket.data.userId;
    const parsed = typingSchema.safeParse(body);
    if (!userId || !parsed.success) return;
    await this.chat.typing(userId, parsed.data.conversationId);
  }
}
