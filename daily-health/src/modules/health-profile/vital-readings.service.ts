import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { emitAuditEvent } from '../../common/events/audit-event.js';
import { AppException } from '../../common/errors/app-exception.js';
import {
  afterCursor,
  toKeysetPage,
} from '../../common/pagination/keyset-cursor.js';
import { ColumnEncryptionService } from '../../core/crypto/column-encryption.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { Prisma, type VitalReading } from '../../generated/prisma/client.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import {
  VITAL_UNITS,
  vitalTypeSchema,
  type CreateVitalRequest,
  type LatestVitalsResponse,
  type ListVitalsQuery,
  type VitalReadingResponse,
} from '../../shared-contracts/health.contract.js';
import type { ProfileAccess } from '../users/profile-access.service.js';
import { HealthProfileErrorCode } from './health-profile-error-codes.js';
import { computeBmi, computeVitalStatus } from './vital-status.js';

const NOTE_CONTEXT = 'health.VitalReading.note';

@Injectable()
export class VitalReadingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: ColumnEncryptionService,
    private readonly events: EventEmitter2,
  ) {}

  async create(
    userId: string,
    access: ProfileAccess,
    input: CreateVitalRequest,
  ): Promise<VitalReadingResponse> {
    const heightCm = profileHeightCm(access);
    const isBp = input.type === 'BP';
    const value = isBp ? null : input.value;
    const context = input.type === 'GLUCOSE' ? input.context : null;

    const reading = await this.prisma.vitalReading.create({
      data: {
        patientId: access.profile.id,
        type: input.type,
        systolic: isBp ? input.systolic : null,
        diastolic: isBp ? input.diastolic : null,
        value: value === null ? null : new Prisma.Decimal(value),
        unit: VITAL_UNITS[input.type],
        context,
        status: computeVitalStatus({
          type: input.type,
          systolic: isBp ? input.systolic : null,
          diastolic: isBp ? input.diastolic : null,
          value,
          context,
          heightCm,
        }),
        note: this.encryption.encryptNullable(input.note, NOTE_CONTEXT),
        recordedByUserId: userId,
        measuredAt: input.measuredAt ? new Date(input.measuredAt) : new Date(),
      },
    });

    emitAuditEvent(this.events, {
      actorUserId: userId,
      patientId: access.profile.id,
      action: 'vital.create',
      entityType: 'VitalReading',
      entityId: reading.id,
      meta: { type: reading.type },
    });
    return this.toResponse(reading, heightCm);
  }

  /** Newest first. Filter by type and a measuredAt range for charts. */
  async list(
    userId: string,
    access: ProfileAccess,
    query: ListVitalsQuery,
  ): Promise<PaginatedResponse<VitalReadingResponse>> {
    const rows = await this.prisma.vitalReading.findMany({
      where: {
        patientId: access.profile.id,
        ...(query.type ? { type: query.type } : {}),
        ...(query.from || query.to
          ? {
              measuredAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
        ...afterCursor('measuredAt', query.cursor),
      },
      orderBy: [{ measuredAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });

    this.auditView(userId, access, query.type ?? 'ALL');
    const heightCm = profileHeightCm(access);
    return toKeysetPage(
      rows,
      query.limit,
      (row) => row.measuredAt,
      (row) => this.toResponse(row, heightCm),
    );
  }

  /** The newest reading of each type, for the profile's vitals cards. */
  async latest(
    userId: string,
    access: ProfileAccess,
  ): Promise<LatestVitalsResponse> {
    const rows = await Promise.all(
      vitalTypeSchema.options.map((type) =>
        this.prisma.vitalReading.findFirst({
          where: { patientId: access.profile.id, type },
          orderBy: [{ measuredAt: 'desc' }, { id: 'desc' }],
        }),
      ),
    );

    this.auditView(userId, access, 'LATEST');
    const heightCm = profileHeightCm(access);
    return {
      data: rows
        .filter((row): row is VitalReading => row !== null)
        .map((row) => this.toResponse(row, heightCm)),
    };
  }

  async remove(
    userId: string,
    access: ProfileAccess,
    readingId: string,
  ): Promise<void> {
    const { count } = await this.prisma.vitalReading.deleteMany({
      where: { id: readingId, patientId: access.profile.id },
    });
    if (count === 0) {
      throw new AppException(
        HealthProfileErrorCode.VITAL_NOT_FOUND,
        'Vital reading not found',
        HttpStatus.NOT_FOUND,
      );
    }
    emitAuditEvent(this.events, {
      actorUserId: userId,
      patientId: access.profile.id,
      action: 'vital.delete',
      entityType: 'VitalReading',
      entityId: readingId,
    });
  }

  private auditView(userId: string, access: ProfileAccess, scope: string) {
    emitAuditEvent(this.events, {
      actorUserId: userId,
      patientId: access.profile.id,
      action: 'vital.view',
      entityType: 'VitalReading',
      entityId: access.profile.id,
      meta: { scope },
    });
  }

  private toResponse(
    reading: VitalReading,
    heightCm: number | null,
  ): VitalReadingResponse {
    const value = reading.value ? reading.value.toNumber() : null;
    return {
      id: reading.id,
      type: reading.type,
      systolic: reading.systolic,
      diastolic: reading.diastolic,
      value,
      unit: reading.unit,
      context: reading.context,
      status: reading.status,
      bmi: reading.type === 'WEIGHT' ? computeBmi(value, heightCm) : null,
      note: this.encryption.decryptNullable(reading.note, NOTE_CONTEXT),
      recordedByUserId: reading.recordedByUserId,
      measuredAt: reading.measuredAt.toISOString(),
      createdAt: reading.createdAt.toISOString(),
    };
  }
}

function profileHeightCm(access: ProfileAccess): number | null {
  return access.profile.heightCm ? access.profile.heightCm.toNumber() : null;
}
