import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { AuditEvent } from '../../common/events/audit-event.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';

/**
 * Writes every `audit.*` event of every module to admin.AuditLog
 * (CLAUDE.md §4 "Audit"). Asynchronous: a slow write never delays the request
 * that caused it, and a failed write is logged (without the event's content)
 * instead of failing that request.
 */
@Injectable()
export class AuditLogWriterService {
  private readonly logger = new Logger(AuditLogWriterService.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('audit.**', { async: true, promisify: true })
  async write(event: AuditEvent): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: event.actorUserId,
          patientId: event.patientId,
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId,
          meta: event.meta ?? undefined,
        },
      });
    } catch (error) {
      this.logger.error(`audit write failed for ${event.action}: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }
}
