import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

export const userRoom = (userId: string): string => `user:${userId}`;

/**
 * Pushes events to users over Socket.io. Fire and forget: a user who is not
 * connected simply misses it (callers send a push notification when that
 * matters, see isConnected). One API process for now; several processes would
 * need the Socket.io Redis adapter.
 */
@Injectable()
export class RealtimeService {
  private server: Server | null = null;
  private readonly connections = new Map<string, number>();

  attach(server: Server): void {
    this.server = server;
  }

  toUser(userId: string, event: string, payload: object): void {
    this.server?.to(userRoom(userId)).emit(event, payload);
  }

  toUsers(userIds: Iterable<string>, event: string, payload: object): void {
    const rooms = [...new Set(userIds)].map(userRoom);
    if (rooms.length > 0) this.server?.to(rooms).emit(event, payload);
  }

  /** Has at least one open socket now (the app or panel is open). */
  isConnected(userId: string): boolean {
    return (this.connections.get(userId) ?? 0) > 0;
  }

  markConnected(userId: string): void {
    this.connections.set(userId, (this.connections.get(userId) ?? 0) + 1);
  }

  markDisconnected(userId: string): void {
    const left = (this.connections.get(userId) ?? 1) - 1;
    if (left > 0) this.connections.set(userId, left);
    else this.connections.delete(userId);
  }
}
