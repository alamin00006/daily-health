import type { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Someone viewed or changed a patient's data (CLAUDE.md §4 "Audit").
 * Modules emit it; the admin module listens on `audit.**` and writes AuditLog.
 * `meta` must never contain health values, names, emails or phone numbers.
 */
export interface AuditEvent {
  /** null for an anonymous actor (a health card scanned without logging in). */
  actorUserId: string | null;
  patientId: string;
  /** Dotted, e.g. "profile.view", "profile.member.remove". */
  action: string;
  entityType: string;
  entityId: string;
  meta?: Record<string, string | number | boolean | null>;
}

export function emitAuditEvent(events: EventEmitter2, event: AuditEvent): void {
  events.emit(`audit.${event.action}`, event);
}
