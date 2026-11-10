import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { emitAuditEvent } from '../../common/events/audit-event.js';
import { AppException } from '../../common/errors/app-exception.js';
import {
  afterCursor,
  toKeysetPage,
} from '../../common/pagination/keyset-cursor.js';
import { addDays, dhakaDate } from '../../common/time/dhaka-time.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import type { MedicationPlanResponse } from '../../shared-contracts/medicine.contract.js';
import {
  doseTimesFromPattern,
  type CreateAlarmFromItemRequest,
  type LinkTestResultRequest,
  type ListPrescriptionsQuery,
  type PrescriptionResponse,
} from '../../shared-contracts/prescription.contract.js';
import { MedicationPlansService } from '../medicine/medication-plans.service.js';
import { MedicalFilesService } from '../records/medical-files.service.js';
import {
  canViewWomensHealth,
  type ProfileAccess,
} from '../users/profile-access.service.js';
import {
  PRESCRIPTION_INCLUDE,
  PrescriptionViewsService,
  type PrescriptionRow,
} from './prescription-views.service.js';
import { PrescriptionsErrorCode } from './prescriptions-error-codes.js';

/**
 * The family's side: issued (and revoked) prescriptions of a profile. A
 * medicine line becomes a medicine alarm in one tap; a prescribed test gets
 * its uploaded report linked. Women's health ones only for the patient themself.
 */
@Injectable()
export class PatientPrescriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly views: PrescriptionViewsService,
    private readonly plans: MedicationPlansService,
    private readonly files: MedicalFilesService,
    private readonly events: EventEmitter2,
  ) {}

  async list(
    userId: string,
    access: ProfileAccess,
    query: ListPrescriptionsQuery,
  ): Promise<PaginatedResponse<PrescriptionResponse>> {
    const rows = await this.prisma.prescription.findMany({
      where: {
        ...this.visible(userId, access),
        ...afterCursor('issuedAt', query.cursor),
      },
      include: PRESCRIPTION_INCLUDE,
      orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    this.audit(userId, access, 'prescription.list', access.profile.id);
    const page = toKeysetPage(rows, query.limit, (row) => row.issuedAt!, (row) => row);
    return { data: await this.views.many(page.data, true), meta: page.meta };
  }

  async get(userId: string, access: ProfileAccess, prescriptionId: string): Promise<PrescriptionResponse> {
    const row = await this.require(userId, access, prescriptionId);
    this.audit(userId, access, 'prescription.view', row.id);
    return this.views.one(row, true);
  }

  /**
   * A medicine alarm from one line: the dose pattern becomes times of day
   * (1+0+½ → 08:00 one, 21:00 half), the course length the end date. The
   * patient can change the times later on the alarm.
   */
  async createAlarm(
    userId: string,
    access: ProfileAccess,
    prescriptionId: string,
    itemId: string,
    input: CreateAlarmFromItemRequest,
  ): Promise<MedicationPlanResponse> {
    const row = await this.require(userId, access, prescriptionId);
    if (row.status !== 'ISSUED') {
      throw new AppException(
        PrescriptionsErrorCode.PRESCRIPTION_STATUS_CONFLICT,
        'This prescription was revoked',
        HttpStatus.CONFLICT,
        { status: row.status },
      );
    }
    const item = row.items.find((i) => i.id === itemId);
    if (!item) {
      throw new AppException(
        PrescriptionsErrorCode.PRESCRIPTION_ITEM_NOT_FOUND,
        'Medicine line not found',
        HttpStatus.NOT_FOUND,
      );
    }
    const existing = (await this.plans.plansForPrescriptionItems(row.patientId, [item.id])).get(item.id);
    if (existing?.isActive) {
      throw new AppException(
        PrescriptionsErrorCode.ALARM_ALREADY_CREATED,
        'An alarm was already made from this medicine',
        HttpStatus.CONFLICT,
        { planId: existing.planId },
      );
    }
    const times = doseTimesFromPattern(item.dosePattern) ?? [{ time: '08:00', dose: 1 }];
    const startDate = input.startDate ?? dhakaDate();
    const plan = await this.plans.create(
      userId,
      access,
      {
        medicineId: item.medicineId ?? undefined,
        displayName: [item.medicineName, item.strength].filter(Boolean).join(' ').slice(0, 80),
        doseUnit: item.doseUnit,
        mealTiming: item.mealTiming,
        startDate,
        endDate: item.durationDays ? addDays(startDate, item.durationDays - 1) : null,
        times,
        refillAlertDays: 5,
      },
      item.id,
    );
    this.audit(userId, access, 'prescription.alarm.create', row.id);
    return plan;
  }

  async linkTestResult(
    userId: string,
    access: ProfileAccess,
    prescriptionId: string,
    testId: string,
    input: LinkTestResultRequest,
  ): Promise<PrescriptionResponse> {
    const row = await this.require(userId, access, prescriptionId);
    const test = row.tests.find((t) => t.id === testId);
    if (!test) {
      throw new AppException(
        PrescriptionsErrorCode.PRESCRIBED_TEST_NOT_FOUND,
        'Test not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (input.fileId && !(await this.files.titlesByIds(row.patientId, [input.fileId])).has(input.fileId)) {
      throw new AppException(
        PrescriptionsErrorCode.RESULT_FILE_NOT_FOUND,
        'Upload the report to this profile first',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.prisma.prescribedTest.update({
      where: { id: test.id },
      data: { resultFileId: input.fileId },
    });
    this.audit(userId, access, 'prescription.test.link', row.id);
    return this.get(userId, access, row.id);
  }

  // -------------------------------------------------------------------------

  /** Issued or revoked (never drafts); women's health ones only for the patient themself. */
  private visible(userId: string, access: ProfileAccess): Prisma.PrescriptionWhereInput {
    const womens = canViewWomensHealth(access.profile, access.membership, userId);
    return {
      patientId: access.profile.id,
      status: { in: ['ISSUED', 'REVOKED'] },
      ...(womens ? {} : { isSensitive: false }),
    };
  }

  private async require(
    userId: string,
    access: ProfileAccess,
    prescriptionId: string,
  ): Promise<PrescriptionRow> {
    const row = await this.prisma.prescription.findFirst({
      where: { id: prescriptionId, ...this.visible(userId, access) },
      include: PRESCRIPTION_INCLUDE,
    });
    if (!row) {
      throw new AppException(
        PrescriptionsErrorCode.PRESCRIPTION_NOT_FOUND,
        'Prescription not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return row;
  }

  private audit(userId: string, access: ProfileAccess, action: string, entityId: string): void {
    emitAuditEvent(this.events, {
      actorUserId: userId,
      patientId: access.profile.id,
      action,
      entityType: 'Prescription',
      entityId,
    });
  }
}
