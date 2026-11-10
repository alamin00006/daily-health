import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { RealtimeTicketResponse } from '../../shared-contracts/realtime.contract.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';

const TICKET_TTL_SECONDS = 60;
const KEY_PREFIX = 'realtime:ticket:';

/**
 * One-time tickets for the Socket.io handshake. The web panel keeps its API
 * tokens in httpOnly cookies, so the browser cannot send a bearer token to the
 * socket; it asks for a ticket through the BFF instead. The app uses the same
 * flow, so there is one way to connect.
 */
@Injectable()
export class RealtimeTicketsService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async issue(userId: string): Promise<RealtimeTicketResponse> {
    const ticket = randomBytes(32).toString('base64url');
    await this.redis.set(`${KEY_PREFIX}${ticket}`, userId, 'EX', TICKET_TTL_SECONDS);
    return {
      ticket,
      expiresAt: new Date(Date.now() + TICKET_TTL_SECONDS * 1000).toISOString(),
    };
  }

  /** The ticket's user, once; null for an unknown, used or expired ticket. */
  async consume(ticket: unknown): Promise<string | null> {
    if (typeof ticket !== 'string' || !/^[\w-]{43}$/.test(ticket)) return null;
    return this.redis.getdel(`${KEY_PREFIX}${ticket}`);
  }
}
