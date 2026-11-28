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
import { StoredUploadsService } from '../../core/uploads/stored-uploads.service.js';
import { UploadedFileProcessorService } from '../../core/uploads/uploaded-file-processor.service.js';
import type { MedicalFile } from '../../generated/prisma/client.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import {
  labTestName,
  MAX_MEDICAL_FILE_BYTES,
  type LabTestCode,
  type LabTestSummaryResponse,
  type ListMedicalFilesQuery,
  type MedicalFileResponse,
  type UpdateMedicalFileRequest,
  type UploadMedicalFileFields,
} from '../../shared-contracts/records.contract.js';
import type { ProfileAccess } from '../users/profile-access.service.js';
import { RecordsErrorCode } from './records-error-codes.js';

const TITLE_CONTEXT = 'records.MedicalFile.title';
const DETAIL_CONTEXTS = {
  institute: 'records.MedicalFile.institute',
  purpose: 'records.MedicalFile.purpose',
  consultantName: 'records.MedicalFile.consultantName',
  note: 'records.MedicalFile.note',
} as const;

/**
 * Lab reports, prescription scans and imaging. Files go through the upload
 * pipeline (magic-byte check, WebP + thumbnails, EXIF stripped) into private
 * storage, and are only reachable through short-lived signed URLs built here
 * after ProfileAccessService has checked the caller.
 */
@Injectable()
export class MedicalFilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: ColumnEncryptionService,
    private readonly uploadProcessor: UploadedFileProcessorService,
    private readonly uploads: StoredUploadsService,
    private readonly events: EventEmitter2,
  ) {}

  async upload(
    userId: string,
    access: ProfileAccess,
    file: Buffer,
    fields: UploadMedicalFileFields,
  ): Promise<MedicalFileResponse> {
    if (
      (fields.type === 'LAB_REPORT' || fields.type === 'PRESCRIPTION_SCAN') &&
      file.length > MAX_MEDICAL_FILE_BYTES
    ) {
      throw new AppException(
        RecordsErrorCode.MEDICAL_FILE_TOO_LARGE,
        'Reports and prescriptions can be up to 5 MB',
        HttpStatus.PAYLOAD_TOO_LARGE,
        { maxBytes: MAX_MEDICAL_FILE_BYTES },
      );
    }
    const processed = await this.uploadProcessor.process(file, {
      allowPdf: true,
    });
    const storageKey = await this.uploads.store(processed, 'private');

    let row: MedicalFile;
    try {
      row = await this.prisma.medicalFile.create({
        data: {
          patientId: access.profile.id,
          type: fields.type,
          title: this.encryption.encrypt(fields.title, TITLE_CONTEXT),
          storageKey,
          mimeType: processed.mimeType,
          sizeBytes: processed.data.length,
          reportDate: toDate(fields.reportDate),
          // A test only means something on a lab report or a scan.
          testCode:
            fields.type === 'LAB_REPORT' || fields.type === 'IMAGING'
              ? (fields.testCode ?? null)
              : null,
          ...this.encryptDetails(fields),
          uploadedByUserId: userId,
        },
      });
    } catch (error) {
      await this.uploads.remove(storageKey, processed.mimeType);
      throw error;
    }

    this.audit(userId, access, 'medical-file.upload', row.id, {
      type: row.type,
    });
    return this.toResponse(row);
  }

  /** Newest uploads first; filter by type. One test's reports come newest report date first. */
  async list(
    userId: string,
    access: ProfileAccess,
    query: ListMedicalFilesQuery,
  ): Promise<PaginatedResponse<MedicalFileResponse>> {
    const page = await this.listForPatient(access.profile.id, query);
    this.audit(userId, access, 'medical-file.list', access.profile.id, {
      type: query.type ?? 'ALL',
      ...(query.testCode ? { testCode: query.testCode } : {}),
    });
    return page;
  }

  /**
   * Files of a patient, no access check: callers check first (ProfileAccessService
   * for members, a live RecordShare for providers).
   */
  async listForPatient(
    patientId: string,
    query: Pick<ListMedicalFilesQuery, 'type' | 'testCode' | 'cursor' | 'limit'>,
  ): Promise<PaginatedResponse<MedicalFileResponse>> {
    const byTest = Boolean(query.testCode);
    // One test's history is read by report date; everything else by upload.
    const sortField = byTest ? 'reportDate' : 'createdAt';
    const rows = await this.prisma.medicalFile.findMany({
      where: {
        patientId,
        deletedAt: null,
        ...(query.type ? { type: query.type } : {}),
        ...(byTest ? { testCode: query.testCode, reportDate: { not: null } } : {}),
        ...afterCursor(sortField, query.cursor),
      },
      orderBy: [{ [sortField]: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    return toKeysetPage(
      rows,
      query.limit,
      (row) => (byTest ? row.reportDate! : row.createdAt),
      (row) => this.toResponse(row),
    );
  }

  /** Lab reports grouped by test ("by name, then by date" in the Roadmap doc). */
  async testSummary(userId: string, access: ProfileAccess): Promise<LabTestSummaryResponse[]> {
    const groups = await this.prisma.medicalFile.groupBy({
      by: ['testCode'],
      where: { patientId: access.profile.id, deletedAt: null, type: 'LAB_REPORT', testCode: { not: null } },
      _count: { _all: true },
      _max: { reportDate: true },
    });
    // "OTHER" shows the latest typed name.
    const other = groups.some((g) => g.testCode === 'OTHER')
      ? await this.prisma.medicalFile.findFirst({
          where: { patientId: access.profile.id, deletedAt: null, type: 'LAB_REPORT', testCode: 'OTHER' },
          orderBy: { createdAt: 'desc' },
          select: { title: true },
        })
      : null;
    this.audit(userId, access, 'medical-file.list', access.profile.id, { type: 'LAB_TESTS' });
    return groups
      .map((g) => {
        const code = g.testCode as LabTestCode;
        return {
          testCode: code,
          name:
            labTestName(code) ??
            (other
              ? g._count._all > 1
                ? `${this.encryption.decrypt(other.title, TITLE_CONTEXT)} ও অন্যান্য`
                : this.encryption.decrypt(other.title, TITLE_CONTEXT)
              : 'অন্যান্য'),
          count: g._count._all,
          latestReportDate: g._max.reportDate?.toISOString().slice(0, 10) ?? null,
        };
      })
      .sort((a, b) => (b.latestReportDate ?? '').localeCompare(a.latestReportDate ?? ''));
  }

  /** How many (not deleted) files each patient has, for the provider's shared list. */
  async countByPatients(patientIds: string[]): Promise<Map<string, number>> {
    if (patientIds.length === 0) return new Map();
    const groups = await this.prisma.medicalFile.groupBy({
      by: ['patientId'],
      where: { patientId: { in: [...new Set(patientIds)] }, deletedAt: null },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.patientId, g._count._all]));
  }

  /** Titles of this patient's (not deleted) files, for other modules (prescribed tests). */
  async titlesByIds(patientId: string, fileIds: string[]): Promise<Map<string, string>> {
    if (fileIds.length === 0) return new Map();
    const rows = await this.prisma.medicalFile.findMany({
      where: { id: { in: [...new Set(fileIds)] }, patientId, deletedAt: null },
      select: { id: true, title: true },
    });
    return new Map(rows.map((row) => [row.id, this.encryption.decrypt(row.title, TITLE_CONTEXT)]));
  }

  /** One file with fresh signed URLs (call again when urlsExpireAt passes). */
  async get(
    userId: string,
    access: ProfileAccess,
    fileId: string,
  ): Promise<MedicalFileResponse> {
    const row = await this.findActive(access, fileId);
    this.audit(userId, access, 'medical-file.view', row.id);
    return this.toResponse(row);
  }

  async update(
    userId: string,
    access: ProfileAccess,
    fileId: string,
    input: UpdateMedicalFileRequest,
  ): Promise<MedicalFileResponse> {
    await this.findActive(access, fileId);
    const row = await this.prisma.medicalFile.update({
      where: { id: fileId },
      data: {
        ...(input.title !== undefined
          ? { title: this.encryption.encrypt(input.title, TITLE_CONTEXT) }
          : {}),
        ...(input.reportDate !== undefined
          ? { reportDate: toDate(input.reportDate) }
          : {}),
        ...(input.testCode !== undefined ? { testCode: input.testCode } : {}),
        ...this.encryptDetails(input),
      },
    });
    this.audit(userId, access, 'medical-file.update', row.id, {
      fields: Object.keys(input).sort().join(','),
    });
    return this.toResponse(row);
  }

  /** Soft delete: the stored file and thumbnails are removed, the row stays for the audit trail. */
  async remove(
    userId: string,
    access: ProfileAccess,
    fileId: string,
  ): Promise<void> {
    const row = await this.findActive(access, fileId);
    await this.prisma.medicalFile.update({
      where: { id: row.id },
      data: { deletedAt: new Date() },
    });
    await this.uploads.remove(row.storageKey, row.mimeType);
    this.audit(userId, access, 'medical-file.delete', row.id);
  }

  private async findActive(
    access: ProfileAccess,
    fileId: string,
  ): Promise<MedicalFile> {
    const row = await this.prisma.medicalFile.findFirst({
      where: { id: fileId, patientId: access.profile.id, deletedAt: null },
    });
    if (!row) {
      throw new AppException(
        RecordsErrorCode.MEDICAL_FILE_NOT_FOUND,
        'File not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return row;
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
      entityType: 'MedicalFile',
      entityId,
      ...(meta ? { meta } : {}),
    });
  }

  /**
   * The free-text details, encrypted (erd.md "এনক্রিপশন": records). `undefined` leaves a
   * column as it is, `null` clears it.
   */
  private encryptDetails(input: {
    institute?: string | null;
    purpose?: string | null;
    consultantName?: string | null;
    note?: string | null;
  }) {
    const data: Partial<Record<keyof typeof DETAIL_CONTEXTS, Uint8Array<ArrayBuffer> | null>> = {};
    for (const field of Object.keys(DETAIL_CONTEXTS) as (keyof typeof DETAIL_CONTEXTS)[]) {
      const value = input[field];
      if (value === undefined) continue;
      data[field] = value ? this.encryption.encrypt(value, DETAIL_CONTEXTS[field]) : null;
    }
    return data;
  }

  private decryptDetail(value: Uint8Array | null, field: keyof typeof DETAIL_CONTEXTS): string | null {
    return value ? this.encryption.decrypt(value, DETAIL_CONTEXTS[field]) : null;
  }

  toResponse(row: MedicalFile): MedicalFileResponse {
    const urls = this.uploads.urls(row.storageKey, row.mimeType);
    return {
      id: row.id,
      type: row.type,
      title: this.encryption.decrypt(row.title, TITLE_CONTEXT),
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      reportDate: row.reportDate
        ? row.reportDate.toISOString().slice(0, 10)
        : null,
      testCode: (row.testCode as LabTestCode | null) ?? null,
      institute: this.decryptDetail(row.institute, 'institute'),
      purpose: this.decryptDetail(row.purpose, 'purpose'),
      consultantName: this.decryptDetail(row.consultantName, 'consultantName'),
      note: this.decryptDetail(row.note, 'note'),
      uploadedByUserId: row.uploadedByUserId,
      fileUrl: urls.url,
      thumbnailUrl: urls.thumbnailUrl,
      previewUrl: urls.previewUrl,
      urlsExpireAt: this.uploads.privateUrlsExpireAt().toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }
}

/** undefined = not sent, null = clear. */
function toDate(date: string | null | undefined): Date | null {
  return date ? new Date(`${date}T00:00:00.000Z`) : null;
}
