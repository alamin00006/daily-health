import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type {
  AppointmentMode,
  AppointmentStatus,
} from '../../generated/prisma/client.js';

/** What other modules (consultation, prescriptions) may know about a booking. */
export interface AppointmentFacts {
  id: string;
  code: string;
  patientId: string;
  bookedByUserId: string;
  providerId: string;
  mode: AppointmentMode;
  status: AppointmentStatus;
  scheduledAt: Date;
  sessionEndAt: Date;
  fee: number;
}

/** Read-only access to appointments for other modules (CLAUDE.md §4 boundaries). */
@Injectable()
export class AppointmentLookupService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(appointmentId: string): Promise<AppointmentFacts | null> {
    const row = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });
    return row ? toFacts(row) : null;
  }

  async findManyByIds(ids: string[]): Promise<Map<string, AppointmentFacts>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.appointment.findMany({
      where: { id: { in: [...new Set(ids)] } },
    });
    return new Map(rows.map((row) => [row.id, toFacts(row)]));
  }
}

function toFacts(row: {
  id: string;
  code: string;
  patientId: string;
  bookedByUserId: string;
  providerId: string;
  mode: AppointmentMode;
  status: AppointmentStatus;
  scheduledAt: Date;
  sessionEndAt: Date;
  fee: { toNumber(): number };
}): AppointmentFacts {
  return {
    id: row.id,
    code: row.code,
    patientId: row.patientId,
    bookedByUserId: row.bookedByUserId,
    providerId: row.providerId,
    mode: row.mode,
    status: row.status,
    scheduledAt: row.scheduledAt,
    sessionEndAt: row.sessionEndAt,
    fee: row.fee.toNumber(),
  };
}
