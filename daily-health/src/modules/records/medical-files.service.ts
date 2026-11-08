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
import type {
  ListMedicalFilesQuery,
  MedicalFileResponse,
  UpdateMedicalFileRequest,
  UploadMedicalFileFields,
} from '../../shared-contracts/records.contract.js';
import type { ProfileAccess } from '../users/profile-access.service.js';
import { RecordsErrorCode } from './records-error-codes.js';

const TITLE_CONTEXT = 'records.MedicalFile.title';

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

  /** Newest uploads first; filter by type. */
  async list(
    userId: string,
    access: ProfileAccess,
    query: ListMedicalFilesQuery,
  ): Promise<PaginatedResponse<MedicalFileResponse>> {
    const rows = await this.prisma.medicalFile.findMany({
      where: {
        patientId: access.profile.id,
        deletedAt: null,
        ...(query.type ? { type: query.type } : {}),
        ...afterCursor('createdAt', query.cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    this.audit(userId, access, 'medical-file.list', access.profile.id, {
      type: query.type ?? 'ALL',
    });
    return toKeysetPage(
      rows,
      query.limit,
      (row) => row.createdAt,
      (row) => this.toResponse(row),
    );
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
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.title !== undefined
          ? { title: this.encryption.encrypt(input.title, TITLE_CONTEXT) }
          : {}),
        ...(input.reportDate !== undefined
          ? { reportDate: toDate(input.reportDate) }
          : {}),
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

  private toResponse(row: MedicalFile): MedicalFileResponse {
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
