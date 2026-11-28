import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { emitAuditEvent } from '../../common/events/audit-event.js';
import { AppException } from '../../common/errors/app-exception.js';
import { ColumnEncryptionService } from '../../core/crypto/column-encryption.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type {
  ConditionKind,
  MedicalCondition,
} from '../../generated/prisma/client.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import type {
  CreateConditionRequest,
  HealthIntakeRequest,
  MedicalConditionResponse,
  UpdateConditionRequest,
} from '../../shared-contracts/health.contract.js';
import type { PatientProfileResponse } from '../../shared-contracts/profiles.contract.js';
import { PatientProfilesService } from '../users/patient-profiles.service.js';
import type { ProfileAccess } from '../users/profile-access.service.js';
import { HealthProfileErrorCode } from './health-profile-error-codes.js';

const NAME_CONTEXT = 'health.MedicalCondition.name';
const NOTE_CONTEXT = 'health.MedicalCondition.note';

/** Chronic conditions, allergies and past surgeries. Names and notes are encrypted. */
@Injectable()
export class MedicalConditionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: ColumnEncryptionService,
    private readonly events: EventEmitter2,
    private readonly profiles: PatientProfilesService,
  ) {}

  /**
   * "Complete your profile" (Roadmap doc, 2026-11-28): the long-term illnesses become
   * CHRONIC conditions (an illness already on the profile is not added twice), then the
   * profile gets its name, gender, birth date and the completion time.
   */
  async intake(
    userId: string,
    access: ProfileAccess,
    input: HealthIntakeRequest,
  ): Promise<PatientProfileResponse> {
    if (input.conditions.length > 0) {
      const existing = await this.prisma.medicalCondition.findMany({
        where: { patientId: access.profile.id, kind: 'CHRONIC' },
        select: { name: true },
      });
      const known = new Set(
        existing.map((row) => normaliseName(this.encryption.decrypt(row.name, NAME_CONTEXT))),
      );
      const fresh = input.conditions.filter((c) => {
        const key = normaliseName(c.name);
        if (known.has(key)) return false;
        known.add(key);
        return true;
      });
      if (fresh.length > 0) {
        await this.prisma.medicalCondition.createMany({
          data: fresh.map((c) => ({
            patientId: access.profile.id,
            kind: 'CHRONIC' as const,
            name: this.encryption.encrypt(c.name, NAME_CONTEXT),
            since: c.durationMonths === null ? null : monthsAgo(c.durationMonths),
          })),
        });
        this.audit(userId, access, 'condition.create', access.profile.id, {
          kind: 'CHRONIC',
          count: String(fresh.length),
        });
      }
    }
    return this.profiles.completeHealthInfo(userId, access, {
      fullName: input.fullName,
      gender: input.gender,
      dateOfBirth: input.dateOfBirth,
    });
  }

  async create(
    userId: string,
    access: ProfileAccess,
    input: CreateConditionRequest,
  ): Promise<MedicalConditionResponse> {
    const condition = await this.prisma.medicalCondition.create({
      data: {
        patientId: access.profile.id,
        kind: input.kind,
        name: this.encryption.encrypt(input.name, NAME_CONTEXT),
        since: toDate(input.since),
        note: this.encryption.encryptNullable(input.note, NOTE_CONTEXT),
      },
    });
    this.audit(userId, access, 'condition.create', condition.id, {
      kind: condition.kind,
    });
    return this.toResponse(condition);
  }

  /**
   * All conditions of a profile (a handful per patient, so not paginated),
   * chronic first. Sorted by name in memory because names are encrypted.
   */
  async list(
    userId: string,
    access: ProfileAccess,
    kind?: ConditionKind,
  ): Promise<PaginatedResponse<MedicalConditionResponse>> {
    const rows = await this.prisma.medicalCondition.findMany({
      where: { patientId: access.profile.id, ...(kind ? { kind } : {}) },
      orderBy: [{ createdAt: 'asc' }],
    });
    this.audit(userId, access, 'condition.view', access.profile.id, {
      kind: kind ?? 'ALL',
    });
    return {
      data: rows.map((row) => this.toResponse(row)).sort(byKindThenName),
      meta: { cursor: null, hasMore: false },
    };
  }

  async update(
    userId: string,
    access: ProfileAccess,
    conditionId: string,
    input: UpdateConditionRequest,
  ): Promise<MedicalConditionResponse> {
    await this.findOwned(access, conditionId);
    const condition = await this.prisma.medicalCondition.update({
      where: { id: conditionId },
      data: {
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.name !== undefined
          ? { name: this.encryption.encrypt(input.name, NAME_CONTEXT) }
          : {}),
        ...(input.since !== undefined ? { since: toDate(input.since) } : {}),
        ...(input.note !== undefined
          ? { note: this.encryption.encryptNullable(input.note, NOTE_CONTEXT) }
          : {}),
      },
    });
    this.audit(userId, access, 'condition.update', conditionId, {
      fields: Object.keys(input).sort().join(','),
    });
    return this.toResponse(condition);
  }

  async remove(
    userId: string,
    access: ProfileAccess,
    conditionId: string,
  ): Promise<void> {
    const { count } = await this.prisma.medicalCondition.deleteMany({
      where: { id: conditionId, patientId: access.profile.id },
    });
    if (count === 0) throw conditionNotFound();
    this.audit(userId, access, 'condition.delete', conditionId);
  }

  /**
   * Decrypted names grouped by kind, for the health card scan. The caller
   * (HealthCardsService) has already checked that the card is valid.
   */
  async namesByKind(
    patientId: string,
  ): Promise<Record<ConditionKind, string[]>> {
    const rows = await this.prisma.medicalCondition.findMany({
      where: { patientId },
      select: { kind: true, name: true },
    });
    const result: Record<ConditionKind, string[]> = {
      CHRONIC: [],
      ALLERGY: [],
      SURGERY: [],
    };
    for (const row of rows) {
      result[row.kind].push(this.encryption.decrypt(row.name, NAME_CONTEXT));
    }
    for (const names of Object.values(result)) names.sort(compareBangla);
    return result;
  }

  private async findOwned(
    access: ProfileAccess,
    conditionId: string,
  ): Promise<MedicalCondition> {
    const condition = await this.prisma.medicalCondition.findFirst({
      where: { id: conditionId, patientId: access.profile.id },
    });
    if (!condition) throw conditionNotFound();
    return condition;
  }

  private audit(
    userId: string,
    access: ProfileAccess,
    action: string,
    entityId: string,
    meta?: Record<string, string>,
  ): void {
    emitAuditEvent(this.events, {
      actorUserId: userId,
      patientId: access.profile.id,
      action,
      entityType: 'MedicalCondition',
      entityId,
      ...(meta ? { meta } : {}),
    });
  }

  private toResponse(condition: MedicalCondition): MedicalConditionResponse {
    return {
      id: condition.id,
      name: this.encryption.decrypt(condition.name, NAME_CONTEXT),
      kind: condition.kind,
      since: condition.since
        ? condition.since.toISOString().slice(0, 10)
        : null,
      note: this.encryption.decryptNullable(condition.note, NOTE_CONTEXT),
      createdAt: condition.createdAt.toISOString(),
      updatedAt: condition.updatedAt.toISOString(),
    };
  }
}

const KIND_ORDER: Record<ConditionKind, number> = {
  CHRONIC: 0,
  ALLERGY: 1,
  SURGERY: 2,
};

function byKindThenName(
  a: MedicalConditionResponse,
  b: MedicalConditionResponse,
): number {
  return (
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || compareBangla(a.name, b.name)
  );
}

const banglaCollator = new Intl.Collator('bn');
function compareBangla(a: string, b: string): number {
  return banglaCollator.compare(a, b);
}

/** undefined = not sent, null = clear. */
function toDate(date: string | null | undefined): Date | null {
  return date ? new Date(`${date}T00:00:00.000Z`) : null;
}

function conditionNotFound(): AppException {
  return new AppException(
    HealthProfileErrorCode.CONDITION_NOT_FOUND,
    'Condition not found',
    HttpStatus.NOT_FOUND,
  );
}

/** "ডায়াবেটিস " and "ডায়াবেটিস" are the same illness. */
function normaliseName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** The first of the month `months` ago (Asia/Dhaka calendar is close enough for "since"). */
function monthsAgo(months: number, now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));
}
