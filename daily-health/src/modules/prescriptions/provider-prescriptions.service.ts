import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { emitAuditEvent } from '../../common/events/audit-event.js';
import { AppException } from '../../common/errors/app-exception.js';
import {
  afterCursor,
  toKeysetPage,
} from '../../common/pagination/keyset-cursor.js';
import { ColumnEncryptionService } from '../../core/crypto/column-encryption.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { ReadableIdService } from '../../core/readable-ids/readable-id.service.js';
import { Prisma, type Provider } from '../../generated/prisma/client.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import type {
  ListProviderPrescriptionsQuery,
  PrescriptionResponse,
  RevokePrescriptionRequest,
  SavePrescriptionDraftRequest,
  StartPrescriptionRequest,
} from '../../shared-contracts/prescription.contract.js';
import { AppointmentLookupService } from '../appointments/appointment-lookup.service.js';
import { ChatService } from '../chat/chat.service.js';
import { ConsultationsService } from '../consultation/consultations.service.js';
import { ProviderDirectoryService } from '../doctors/provider-directory.service.js';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service.js';
import { PatientProfilesService } from '../users/patient-profiles.service.js';
import {
  ENC,
  PRESCRIPTION_INCLUDE,
  PrescriptionViewsService,
  type PrescriptionRow,
} from './prescription-views.service.js';
import { PrescriptionsErrorCode } from './prescriptions-error-codes.js';

/** A visit can get its prescription from an hour before its time. */
const EARLIEST_BEFORE_VISIT_MS = 60 * 60_000;

interface Source {
  patientId: string;
  appointmentId: string | null;
  consultationId: string | null;
  /** Who gets told when it is issued (booker / requester). */
  requesterUserId: string;
  isSensitive: boolean;
}

/**
 * The doctor's side: a draft per visit or consultation, edited freely, then
 * issued (fixed from then on) or revoked with a reason. Issuing tells the
 * patient's family and puts a card in the consultation chat.
 */
@Injectable()
export class ProviderPrescriptionsService {
  private readonly logger = new Logger(ProviderPrescriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: ColumnEncryptionService,
    private readonly readableIds: ReadableIdService,
    private readonly views: PrescriptionViewsService,
    private readonly directory: ProviderDirectoryService,
    private readonly appointments: AppointmentLookupService,
    private readonly consultations: ConsultationsService,
    private readonly profiles: PatientProfilesService,
    private readonly chat: ChatService,
    private readonly delivery: NotificationDeliveryService,
    private readonly events: EventEmitter2,
  ) {}

  /** The open (draft or issued) prescription of a visit/consultation, or a new draft. */
  async start(userId: string, input: StartPrescriptionRequest): Promise<PrescriptionResponse> {
    const provider = await this.requirePrescriber(userId);
    const source = await this.resolveSource(userId, provider, input);
    const open = await this.findOpen(source);
    if (open) return this.views.one(open);

    try {
      const row = await this.prisma.$transaction(async (tx) =>
        tx.prescription.create({
          data: {
            code: await this.readableIds.nextReference('PRESCRIPTION', tx),
            patientId: source.patientId,
            providerId: provider.id,
            providerUserId: userId,
            appointmentId: source.appointmentId,
            consultationId: source.consultationId,
            isSensitive: source.isSensitive,
          },
          include: PRESCRIPTION_INCLUDE,
        }),
      );
      this.audit(userId, row, 'prescription.create');
      return this.views.one(row);
    } catch (error) {
      // Opened from two tabs at once: the partial unique index kept one.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.findOpen(source);
        if (raced) return this.views.one(raced);
      }
      throw error;
    }
  }

  async list(
    userId: string,
    query: ListProviderPrescriptionsQuery,
  ): Promise<PaginatedResponse<PrescriptionResponse>> {
    const provider = await this.directory.requireOwn(userId);
    const rows = await this.prisma.prescription.findMany({
      where: {
        providerId: provider.id,
        ...(query.status ? { status: query.status } : {}),
        ...afterCursor('createdAt', query.cursor),
      },
      include: PRESCRIPTION_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = toKeysetPage(rows, query.limit, (row) => row.createdAt, (row) => row);
    return { data: await this.views.many(page.data), meta: page.meta };
  }

  async get(userId: string, prescriptionId: string): Promise<PrescriptionResponse> {
    const row = await this.requireOwn(userId, prescriptionId);
    this.audit(userId, row, 'prescription.view');
    return this.views.one(row);
  }

  /** Replaces the whole draft (fields, medicines and tests). */
  async save(
    userId: string,
    prescriptionId: string,
    input: SavePrescriptionDraftRequest,
  ): Promise<PrescriptionResponse> {
    const row = await this.requireOwn(userId, prescriptionId);
    if (row.status !== 'DRAFT') throw statusConflict(row.status);
    const saved = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.prescription.updateMany({
        where: { id: row.id, status: 'DRAFT' },
        data: {
          chiefComplaint: this.enc(input.chiefComplaint, ENC.chiefComplaint),
          diagnosis: this.enc(input.diagnosis, ENC.diagnosis),
          advice: this.enc(input.advice, ENC.advice),
          followUpAfterDays: input.followUpAfterDays ?? null,
        },
      });
      if (changed.count === 0) throw statusConflict('ISSUED');
      await tx.prescriptionItem.deleteMany({ where: { prescriptionId: row.id } });
      await tx.prescribedTest.deleteMany({ where: { prescriptionId: row.id } });
      if (input.items.length > 0) {
        await tx.prescriptionItem.createMany({
          data: input.items.map((item, position) => ({
            prescriptionId: row.id,
            position,
            medicineId: item.medicineId ?? null,
            medicineName: item.medicineName,
            strength: item.strength || null,
            form: item.form,
            doseUnit: item.doseUnit,
            dosePattern: item.dosePattern.replace(/\s+/g, ''),
            mealTiming: item.mealTiming,
            durationDays: item.durationDays,
            instruction: item.instruction || null,
          })),
        });
      }
      if (input.tests.length > 0) {
        await tx.prescribedTest.createMany({
          data: input.tests.map((test, position) => ({
            prescriptionId: row.id,
            position,
            testName: test.testName,
            note: test.note || null,
          })),
        });
      }
      return tx.prescription.findUniqueOrThrow({ where: { id: row.id }, include: PRESCRIPTION_INCLUDE });
    });
    this.audit(userId, saved, 'prescription.update');
    return this.views.one(saved);
  }

  /** DRAFT → ISSUED: fixed from now on; the family is told and the chat gets a card. */
  async issue(userId: string, prescriptionId: string): Promise<PrescriptionResponse> {
    const row = await this.requireOwn(userId, prescriptionId);
    if (row.status !== 'DRAFT') throw statusConflict(row.status);
    if (row.items.length === 0 && row.tests.length === 0 && !row.advice) {
      throw new AppException(
        PrescriptionsErrorCode.PRESCRIPTION_EMPTY,
        'Add at least one medicine, test or advice before issuing',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const changed = await this.prisma.prescription.updateMany({
      where: { id: row.id, status: 'DRAFT' },
      data: { status: 'ISSUED', issuedAt: new Date() },
    });
    if (changed.count === 0) throw statusConflict('ISSUED');
    const issued = await this.prisma.prescription.findUniqueOrThrow({
      where: { id: row.id },
      include: PRESCRIPTION_INCLUDE,
    });
    this.audit(userId, issued, 'prescription.issue');

    const provider = await this.directory.findById(issued.providerId);
    const doctor = provider ? `ডা. ${provider.displayName}` : 'ডাক্তার';
    await this.postToChat(userId, issued, `${doctor} প্রেসক্রিপশন দিয়েছেন (${issued.code})`);
    await this.notify(issued, {
      type: 'prescription.issued',
      title: `${doctor} প্রেসক্রিপশন দিয়েছেন`,
      body: issued.items.length > 0 ? 'অ্যাপে খুলে এক চাপে ওষুধের অ্যালার্ম চালু করুন।' : 'অ্যাপে খুলে দেখুন।',
    });
    return this.views.one(issued);
  }

  /** ISSUED → REVOKED with a reason (a mistake): the family is told; write a new one. */
  async revoke(
    userId: string,
    prescriptionId: string,
    input: RevokePrescriptionRequest,
  ): Promise<PrescriptionResponse> {
    const row = await this.requireOwn(userId, prescriptionId);
    if (row.status !== 'ISSUED') throw statusConflict(row.status);
    const changed = await this.prisma.prescription.updateMany({
      where: { id: row.id, status: 'ISSUED' },
      data: { status: 'REVOKED', revokedAt: new Date(), revokeReason: input.reason },
    });
    if (changed.count === 0) throw statusConflict('REVOKED');
    const revoked = await this.prisma.prescription.findUniqueOrThrow({
      where: { id: row.id },
      include: PRESCRIPTION_INCLUDE,
    });
    this.audit(userId, revoked, 'prescription.revoke');
    await this.notify(revoked, {
      type: 'prescription.revoked',
      title: `প্রেসক্রিপশন ${revoked.code} বাতিল হয়েছে`,
      body: 'ডাক্তার এটি বাতিল করেছেন। এর ওষুধের অ্যালার্ম চালু থাকলে দেখে বন্ধ করুন।',
    });
    return this.views.one(revoked);
  }

  async removeDraft(userId: string, prescriptionId: string): Promise<void> {
    const row = await this.requireOwn(userId, prescriptionId);
    if (row.status !== 'DRAFT') throw statusConflict(row.status);
    await this.prisma.prescription.deleteMany({ where: { id: row.id, status: 'DRAFT' } });
    this.audit(userId, row, 'prescription.delete');
  }

  // -------------------------------------------------------------------------

  private async requirePrescriber(userId: string): Promise<Provider> {
    const provider = await this.directory.requireOwn(userId);
    if (provider.type !== 'DOCTOR' || provider.verificationStatus !== 'VERIFIED') {
      throw new AppException(
        PrescriptionsErrorCode.PRESCRIBER_NOT_ALLOWED,
        'Only verified doctors write prescriptions',
        HttpStatus.FORBIDDEN,
      );
    }
    return provider;
  }

  private async resolveSource(
    userId: string,
    provider: Provider,
    input: StartPrescriptionRequest,
  ): Promise<Source> {
    if (input.appointmentId) {
      const appointment = await this.appointments.findById(input.appointmentId);
      const ok =
        appointment &&
        appointment.providerId === provider.id &&
        (appointment.status === 'COMPLETED' ||
          (appointment.status === 'CONFIRMED' &&
            appointment.scheduledAt.getTime() - EARLIEST_BEFORE_VISIT_MS <= Date.now()));
      if (!ok) throw sourceInvalid();
      return {
        patientId: appointment.patientId,
        appointmentId: appointment.id,
        consultationId: null,
        requesterUserId: appointment.bookedByUserId,
        isSensitive: false,
      };
    }
    const consultation = await this.consultations
      .requireProviderOf(userId, input.consultationId!)
      .catch(() => null);
    if (!consultation || !['ONGOING', 'ENDED'].includes(consultation.status)) throw sourceInvalid();
    return {
      patientId: consultation.patientId,
      appointmentId: null,
      consultationId: consultation.id,
      requesterUserId: consultation.requestedByUserId,
      isSensitive: consultation.quickKind === 'WOMENS_HEALTH',
    };
  }

  private findOpen(source: Source): Promise<PrescriptionRow | null> {
    return this.prisma.prescription.findFirst({
      where: {
        status: { not: 'REVOKED' },
        ...(source.appointmentId
          ? { appointmentId: source.appointmentId }
          : { consultationId: source.consultationId }),
      },
      include: PRESCRIPTION_INCLUDE,
    });
  }

  private async requireOwn(userId: string, prescriptionId: string): Promise<PrescriptionRow> {
    const row = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: PRESCRIPTION_INCLUDE,
    });
    if (!row || row.providerUserId !== userId) {
      throw new AppException(
        PrescriptionsErrorCode.PRESCRIPTION_NOT_FOUND,
        'Prescription not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return row;
  }

  /** A card in the consultation chat (a booked video/chat visit's too). */
  private async postToChat(userId: string, row: PrescriptionRow, text: string): Promise<void> {
    const consultationId =
      row.consultationId ??
      (row.appointmentId ? (await this.consultations.findByAppointment(row.appointmentId))?.id : null);
    if (!consultationId) return;
    await this.chat
      .postPrescription(consultationId, userId, text, row.id)
      .catch((error: Error) => this.logger.warn(`prescription chat card failed: ${error.message}`));
  }

  /** The booker/requester and the patient's own account; no health details in the text. */
  private async notify(
    row: PrescriptionRow,
    message: { type: string; title: string; body: string },
  ): Promise<void> {
    const source = row.appointmentId
      ? (await this.appointments.findById(row.appointmentId))?.bookedByUserId
      : row.consultationId
        ? (await this.consultations.requireProviderOf(row.providerUserId, row.consultationId).catch(() => null))
            ?.requestedByUserId
        : undefined;
    const profile = (await this.profiles.findManyByIds([row.patientId])).get(row.patientId);
    const recipients = [...new Set([source, profile?.linkedUserId].filter((id): id is string => Boolean(id)))];
    await this.delivery
      .deliver(
        recipients.map((userId) => ({
          userId,
          patientId: row.patientId,
          ...message,
          data: { screen: 'prescription', profileId: row.patientId, prescriptionId: row.id },
          channels: ['PUSH', 'IN_APP'],
          sensitive: row.isSensitive,
        })),
      )
      .catch((error: Error) => this.logger.warn(`prescription notice failed: ${error.message}`));
  }

  private enc(value: string | undefined, context: string): Uint8Array<ArrayBuffer> | null {
    return value ? (this.encryption.encrypt(value, context) as Uint8Array<ArrayBuffer>) : null;
  }

  private audit(userId: string, row: { id: string; patientId: string }, action: string): void {
    emitAuditEvent(this.events, {
      actorUserId: userId,
      patientId: row.patientId,
      action,
      entityType: 'Prescription',
      entityId: row.id,
    });
  }
}

function statusConflict(status: string): AppException {
  return new AppException(
    PrescriptionsErrorCode.PRESCRIPTION_STATUS_CONFLICT,
    `Not possible while the prescription is ${status}`,
    HttpStatus.CONFLICT,
    { status },
  );
}

function sourceInvalid(): AppException {
  return new AppException(
    PrescriptionsErrorCode.PRESCRIPTION_SOURCE_INVALID,
    'Write prescriptions for your own confirmed or completed visits and consultations',
    HttpStatus.CONFLICT,
  );
}
