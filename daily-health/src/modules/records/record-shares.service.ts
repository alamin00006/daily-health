import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { emitAuditEvent } from '../../common/events/audit-event.js';
import { AppException } from '../../common/errors/app-exception.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { RecordShare } from '../../generated/prisma/client.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import type {
  CreateRecordShareRequest,
  MedicalFileResponse,
  RecordShareResponse,
  SharedFilesQuery,
  SharedPatientResponse,
} from '../../shared-contracts/records.contract.js';
import { ProviderDirectoryService } from '../doctors/provider-directory.service.js';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service.js';
import { PatientProfilesService } from '../users/patient-profiles.service.js';
import type { ProfileAccess } from '../users/profile-access.service.js';
import { MedicalFilesService } from './medical-files.service.js';
import { RecordsErrorCode } from './records-error-codes.js';

const DAY_MS = 24 * 3_600_000;

/**
 * A patient (an OWNER or CAREGIVER of the profile) lets a doctor see the whole file
 * history for 1–90 days (Roadmap doc, 2026-11-28: "share the report history with
 * another doctor in the app"). The doctor reads it from the panel or the app's provider
 * area; every read is audited against the patient.
 */
@Injectable()
export class RecordSharesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: MedicalFilesService,
    private readonly providers: ProviderDirectoryService,
    private readonly profiles: PatientProfilesService,
    private readonly delivery: NotificationDeliveryService,
    private readonly events: EventEmitter2,
  ) {}

  // ------------------------------------------------------------ patient side

  /** Shares (or extends the live share) with a verified provider. */
  async share(
    userId: string,
    access: ProfileAccess,
    input: CreateRecordShareRequest,
  ): Promise<RecordShareResponse> {
    const provider = await this.providers.requireVerified(input.providerId);
    const expiresAt = new Date(Date.now() + input.days * DAY_MS);
    const live = await this.prisma.recordShare.findFirst({
      where: { patientId: access.profile.id, providerId: provider.id, revokedAt: null },
    });
    const row = live
      ? await this.prisma.recordShare.update({
          where: { id: live.id },
          // Never shortens a share that already runs longer.
          data: { expiresAt: live.expiresAt > expiresAt ? live.expiresAt : expiresAt, grantedByUserId: userId },
        })
      : await this.prisma.recordShare.create({
          data: {
            patientId: access.profile.id,
            providerId: provider.id,
            grantedByUserId: userId,
            expiresAt,
          },
        });

    this.audit(userId, access.profile.id, 'record-share.grant', row.id, { providerId: provider.id, days: String(input.days) });
    await this.delivery.deliver([
      {
        userId: provider.userId,
        patientId: null,
        type: 'records.shared',
        title: 'রোগী রিপোর্ট দেখার অনুমতি দিয়েছেন',
        // The patient's name only: no test names or results in push text.
        body: `${access.profile.fullName} (${access.profile.patientCode}) তাঁর রিপোর্ট আর প্রেসক্রিপশন আপনাকে দেখতে দিয়েছেন।`,
        data: { screen: 'shared-records', patientId: access.profile.id },
        channels: ['PUSH', 'IN_APP'],
      },
    ]);
    return this.toResponse(row);
  }

  async listForProfile(access: ProfileAccess): Promise<RecordShareResponse[]> {
    const rows = await this.prisma.recordShare.findMany({
      where: { patientId: access.profile.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return this.toResponses(rows);
  }

  async revoke(userId: string, access: ProfileAccess, shareId: string): Promise<void> {
    const changed = await this.prisma.recordShare.updateMany({
      where: { id: shareId, patientId: access.profile.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (changed.count === 0) {
      throw new AppException(RecordsErrorCode.RECORD_SHARE_NOT_FOUND, 'Share not found', HttpStatus.NOT_FOUND);
    }
    this.audit(userId, access.profile.id, 'record-share.revoke', shareId);
  }

  // ----------------------------------------------------------- provider side

  /** Patients whose files I may see now. */
  async sharedWithMe(userId: string): Promise<SharedPatientResponse[]> {
    const provider = await this.providers.requireOwn(userId);
    const shares = await this.prisma.recordShare.findMany({
      where: { providerId: provider.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    const patientIds = shares.map((s) => s.patientId);
    const [profiles, counts] = await Promise.all([
      this.profiles.findManyByIds(patientIds),
      this.files.countByPatients(patientIds),
    ]);
    return shares.flatMap((share) => {
      const profile = profiles.get(share.patientId);
      if (!profile || profile.deletedAt) return [];
      return [
        {
          shareId: share.id,
          patientId: profile.id,
          patientCode: profile.patientCode,
          fullName: profile.fullName,
          gender: profile.gender,
          age: profile.dateOfBirth ? ageInYears(profile.dateOfBirth) : null,
          expiresAt: share.expiresAt.toISOString(),
          fileCount: counts.get(profile.id) ?? 0,
        },
      ];
    });
  }

  /** A sharing patient's files, while the share lasts. */
  async sharedFiles(
    userId: string,
    patientId: string,
    query: SharedFilesQuery,
  ): Promise<PaginatedResponse<MedicalFileResponse>> {
    const provider = await this.providers.requireOwn(userId);
    const share = await this.prisma.recordShare.findFirst({
      where: { patientId, providerId: provider.id, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!share) {
      throw new AppException(
        RecordsErrorCode.RECORDS_NOT_SHARED,
        'This patient has not shared their files with you',
        HttpStatus.FORBIDDEN,
      );
    }
    const page = await this.files.listForPatient(patientId, query);
    this.audit(userId, patientId, 'medical-file.list-shared', share.id, { type: query.type ?? 'ALL' });
    return page;
  }

  // ----------------------------------------------------------------- helpers

  private async toResponses(rows: RecordShare[]): Promise<RecordShareResponse[]> {
    const summaries = await this.providers.summariesByIds(rows.map((r) => r.providerId));
    const now = Date.now();
    return rows.flatMap((row) => {
      const provider = summaries.get(row.providerId);
      if (!provider) return [];
      return [
        {
          id: row.id,
          provider,
          expiresAt: row.expiresAt.toISOString(),
          active: row.revokedAt === null && row.expiresAt.getTime() > now,
          createdAt: row.createdAt.toISOString(),
        },
      ];
    });
  }

  private async toResponse(row: RecordShare): Promise<RecordShareResponse> {
    const [response] = await this.toResponses([row]);
    if (!response) throw new Error('Shared provider vanished');
    return response;
  }

  private audit(
    actorUserId: string,
    patientId: string,
    action: string,
    entityId: string,
    meta?: Record<string, string>,
  ): void {
    emitAuditEvent(this.events, {
      actorUserId,
      patientId,
      action,
      entityType: 'RecordShare',
      entityId,
      ...(meta ? { meta } : {}),
    });
  }
}

function ageInYears(dateOfBirth: Date, now = new Date()): number {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < dateOfBirth.getUTCMonth() ||
    (now.getUTCMonth() === dateOfBirth.getUTCMonth() && now.getUTCDate() < dateOfBirth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}
