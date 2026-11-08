import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { ReadableIdService } from '../../core/readable-ids/readable-id.service.js';
import { StoredUploadsService } from '../../core/uploads/stored-uploads.service.js';
import { UploadedFileProcessorService } from '../../core/uploads/uploaded-file-processor.service.js';
import { Prisma, type Provider } from '../../generated/prisma/client.js';
import type {
  MyProviderProfileResponse,
  ProviderType,
  RegisterProviderRequest,
  UpdateProviderRequest,
  UploadVerificationDocFields,
  VerificationDocumentResponse,
} from '../../shared-contracts/doctors.contract.js';
import { UserAccountsService } from '../auth/user-accounts.service.js';
import { isUniqueViolation } from '../users/patient-profiles.service.js';
import { DoctorsErrorCode } from './doctors-error-codes.js';
import { ProviderDirectoryService } from './provider-directory.service.js';
import {
  PROVIDER_AVATAR_MIME,
  PROVIDER_SUMMARY_INCLUDE,
  toChamberResponse,
  toProviderDetail,
  toScheduleResponse,
} from './provider-responses.js';

/**
 * A provider's own profile in the web panel: registration, details and fees,
 * photo, verification documents, and going online. Patients never see a
 * profile until an admin marks it VERIFIED (ProviderVerificationService).
 */
@Injectable()
export class ProviderProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly readableIds: ReadableIdService,
    private readonly uploads: StoredUploadsService,
    private readonly uploadProcessor: UploadedFileProcessorService,
    private readonly accounts: UserAccountsService,
    private readonly directory: ProviderDirectoryService,
  ) {}

  async get(userId: string): Promise<MyProviderProfileResponse> {
    const provider = await this.directory.requireOwn(userId);
    return this.view(provider.id);
  }

  async register(
    userId: string,
    input: RegisterProviderRequest,
  ): Promise<MyProviderProfileResponse> {
    const existing = await this.prisma.provider.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (existing) {
      throw new AppException(
        DoctorsErrorCode.PROVIDER_PROFILE_EXISTS,
        'This account already has a provider profile',
        HttpStatus.CONFLICT,
      );
    }
    await this.assertSpecialties(input.specialtyIds, input.type);

    let provider: Provider;
    try {
      provider = await this.prisma.$transaction(async (tx) => {
        const providerCode = await this.readableIds.next(
          input.type,
          input.displayName,
          tx,
        );
        return tx.provider.create({
          data: {
            userId,
            providerCode,
            type: input.type,
            gender: input.gender,
            displayName: input.displayName,
            designation: input.designation ?? null,
            qualifications: input.qualifications,
            bmdcNo: input.type === 'DOCTOR' ? (input.bmdcNo ?? null) : null,
            experienceYears: input.experienceYears,
            bio: input.bio ?? null,
            specialties: {
              create: input.specialtyIds.map((specialtyId) => ({
                specialtyId,
              })),
            },
          },
        });
      });
    } catch (error) {
      throw mapUniqueError(error);
    }
    await this.accounts.promoteToProviderRole(userId, input.type);
    return this.view(provider.id);
  }

  async update(
    userId: string,
    input: UpdateProviderRequest,
  ): Promise<MyProviderProfileResponse> {
    const provider = await this.directory.requireOwn(userId);
    if (input.bmdcNo !== undefined && provider.type !== 'DOCTOR') {
      throw new AppException(
        DoctorsErrorCode.BMDC_NOT_APPLICABLE,
        'Only doctors have a BMDC number',
      );
    }
    if (input.specialtyIds) {
      await this.assertSpecialties(input.specialtyIds, provider.type);
    }
    await this.assertModeFees(provider, input);

    const bmdcChanged =
      input.bmdcNo !== undefined && input.bmdcNo !== provider.bmdcNo;
    try {
      await this.prisma.$transaction(async (tx) => {
        if (input.specialtyIds) {
          await tx.providerSpecialty.deleteMany({
            where: { providerId: provider.id },
          });
          await tx.providerSpecialty.createMany({
            data: input.specialtyIds.map((specialtyId) => ({
              providerId: provider.id,
              specialtyId,
            })),
          });
        }
        await tx.provider.update({
          where: { id: provider.id },
          data: {
            ...pick(input, [
              'gender',
              'displayName',
              'designation',
              'qualifications',
              'experienceYears',
              'bio',
              'acceptsQuickConsult',
              'offersHomeVisit',
            ]),
            ...(input.bmdcNo !== undefined ? { bmdcNo: input.bmdcNo } : {}),
            ...feeData(input),
            // A new BMDC number has to be checked again.
            ...(bmdcChanged && provider.verificationStatus === 'VERIFIED'
              ? {
                  verificationStatus: 'PENDING',
                  verifiedAt: null,
                  verifiedByUserId: null,
                  isOnline: false,
                }
              : {}),
          },
        });
      });
    } catch (error) {
      throw mapUniqueError(error);
    }
    return this.view(provider.id);
  }

  async setAvatar(
    userId: string,
    file: Buffer,
  ): Promise<MyProviderProfileResponse> {
    const provider = await this.directory.requireOwn(userId);
    const processed = await this.uploadProcessor.process(file, {
      allowPdf: false,
      avatar: true,
    });
    const storageKey = await this.uploads.store(processed, 'public');
    try {
      await this.prisma.provider.update({
        where: { id: provider.id },
        data: { avatarStorageKey: storageKey },
      });
    } catch (error) {
      await this.uploads.remove(storageKey, processed.mimeType);
      throw error;
    }
    if (provider.avatarStorageKey) {
      await this.uploads.remove(provider.avatarStorageKey, PROVIDER_AVATAR_MIME);
    }
    return this.view(provider.id);
  }

  async removeAvatar(userId: string): Promise<void> {
    const provider = await this.directory.requireOwn(userId);
    if (!provider.avatarStorageKey) return;
    await this.prisma.provider.update({
      where: { id: provider.id },
      data: { avatarStorageKey: null },
    });
    await this.uploads.remove(provider.avatarStorageKey, PROVIDER_AVATAR_MIME);
  }

  /** BMDC certificate, NID, degree: images or PDF, stored privately. */
  async uploadDocument(
    userId: string,
    file: Buffer,
    fields: UploadVerificationDocFields,
  ): Promise<MyProviderProfileResponse> {
    const provider = await this.directory.requireOwn(userId);
    const processed = await this.uploadProcessor.process(file, {
      allowPdf: true,
    });
    const storageKey = await this.uploads.store(processed, 'private');
    try {
      await this.prisma.verificationDocument.create({
        data: {
          providerId: provider.id,
          docType: fields.docType,
          storageKey,
          mimeType: processed.mimeType,
        },
      });
    } catch (error) {
      await this.uploads.remove(storageKey, processed.mimeType);
      throw error;
    }
    return this.view(provider.id);
  }

  async removeDocument(userId: string, documentId: string): Promise<void> {
    const provider = await this.directory.requireOwn(userId);
    const document = await this.prisma.verificationDocument.findFirst({
      where: { id: documentId, providerId: provider.id },
    });
    if (!document) {
      throw new AppException(
        DoctorsErrorCode.DOCUMENT_NOT_FOUND,
        'Document not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (document.status === 'APPROVED') {
      throw new AppException(
        DoctorsErrorCode.DOCUMENT_LOCKED,
        'An approved document cannot be deleted',
        HttpStatus.CONFLICT,
      );
    }
    await this.prisma.verificationDocument.delete({
      where: { id: document.id },
    });
    await this.uploads.remove(document.storageKey, document.mimeType);
  }

  /** After a rejection: fixed, send it to the admins again. */
  async resubmit(userId: string): Promise<MyProviderProfileResponse> {
    const provider = await this.directory.requireOwn(userId);
    if (provider.verificationStatus !== 'REJECTED') {
      throw new AppException(
        DoctorsErrorCode.VERIFICATION_NOT_ALLOWED,
        'Only a rejected profile can be resubmitted',
        HttpStatus.CONFLICT,
      );
    }
    const view = await this.view(provider.id);
    if (view.missingForVerification.length > 0) {
      throw new AppException(
        DoctorsErrorCode.VERIFICATION_INCOMPLETE,
        'Documents or sessions are missing',
        HttpStatus.CONFLICT,
        { missing: view.missingForVerification },
      );
    }
    await this.prisma.provider.update({
      where: { id: provider.id },
      data: { verificationStatus: 'PENDING', rejectionReason: null },
    });
    return this.view(provider.id);
  }

  /** Online now: shown first in search, and (step 7) gets quick consults. */
  async setOnline(
    userId: string,
    isOnline: boolean,
  ): Promise<MyProviderProfileResponse> {
    const provider = await this.directory.requireOwn(userId);
    if (isOnline && provider.verificationStatus !== 'VERIFIED') {
      throw new AppException(
        DoctorsErrorCode.PROVIDER_NOT_VERIFIED,
        'Only verified providers can go online',
        HttpStatus.CONFLICT,
      );
    }
    await this.prisma.provider.update({
      where: { id: provider.id },
      data: {
        isOnline,
        ...(isOnline ? { lastOnlineAt: new Date() } : {}),
      },
    });
    return this.view(provider.id);
  }

  /** The full self view (also used by the admin review). */
  async view(providerId: string): Promise<MyProviderProfileResponse> {
    const provider = await this.prisma.provider.findUniqueOrThrow({
      where: { id: providerId },
      include: {
        ...PROVIDER_SUMMARY_INCLUDE,
        documents: { orderBy: { createdAt: 'desc' } },
      },
    });
    const allSchedules = await this.prisma.schedule.findMany({
      where: { providerId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
    const detail = toProviderDetail(
      provider,
      this.uploads,
      await this.directory.latestReviews(provider.id, 3),
    );

    const missing: MyProviderProfileResponse['missingForVerification'] = [];
    if (
      provider.type === 'DOCTOR' &&
      !provider.documents.some((d) => d.docType === 'BMDC_CERT')
    ) {
      missing.push('BMDC_CERT');
    }
    if (
      !provider.chambers.some((c) => c.isActive) &&
      provider.videoFee === null &&
      provider.chatFee === null
    ) {
      missing.push('CHAMBER_OR_ONLINE_FEE');
    }

    return {
      ...detail,
      verificationStatus: provider.verificationStatus,
      rejectionReason: provider.rejectionReason,
      verifiedAt: provider.verifiedAt?.toISOString() ?? null,
      documents: provider.documents.map((document) =>
        this.toDocumentResponse(document),
      ),
      allChambers: provider.chambers.map(toChamberResponse),
      allSchedules: allSchedules.map(toScheduleResponse),
      missingForVerification: missing,
      urlsExpireAt: this.uploads.privateUrlsExpireAt().toISOString(),
    };
  }

  private toDocumentResponse(
    document: Prisma.VerificationDocumentGetPayload<object>,
  ): VerificationDocumentResponse {
    const urls = this.uploads.urls(document.storageKey, document.mimeType);
    return {
      id: document.id,
      docType: document.docType,
      status: document.status,
      mimeType: document.mimeType,
      url: urls.url,
      thumbnailUrl: urls.thumbnailUrl,
      createdAt: document.createdAt.toISOString(),
    };
  }

  private async assertSpecialties(
    specialtyIds: string[],
    type: ProviderType,
  ): Promise<void> {
    const unique = [...new Set(specialtyIds)];
    const count = await this.prisma.specialty.count({
      where: { id: { in: unique }, forType: type },
    });
    if (count !== unique.length) {
      throw new AppException(
        DoctorsErrorCode.SPECIALTY_NOT_FOUND,
        'Unknown specialty for this provider type',
      );
    }
  }

  /**
   * A mode with active sessions needs its fee; home visits need a fee to be
   * offered at all.
   */
  private async assertModeFees(
    provider: Provider,
    input: UpdateProviderRequest,
  ): Promise<void> {
    const homeVisitFee =
      input.homeVisitFee !== undefined
        ? input.homeVisitFee
        : provider.homeVisitFee;
    const offersHomeVisit = input.offersHomeVisit ?? provider.offersHomeVisit;
    if (offersHomeVisit && homeVisitFee === null) {
      throw modeFeeMissing('HOME_VISIT');
    }
    const cleared = (
      [
        ['VIDEO', input.videoFee],
        ['CHAT', input.chatFee],
        ['HOME_VISIT', input.homeVisitFee],
      ] as const
    )
      .filter(([, fee]) => fee === null)
      .map(([mode]) => mode);
    if (cleared.length === 0) return;
    const active = await this.prisma.schedule.findFirst({
      where: { providerId: provider.id, isActive: true, mode: { in: cleared } },
      select: { mode: true },
    });
    if (active) throw modeFeeMissing(active.mode);
  }
}

export function modeFeeMissing(mode: string): AppException {
  return new AppException(
    DoctorsErrorCode.MODE_FEE_MISSING,
    `Set the ${mode} fee first (or turn its sessions off)`,
    HttpStatus.CONFLICT,
    { mode },
  );
}

function feeData(input: UpdateProviderRequest) {
  const decimal = (value: number | null | undefined) =>
    value === undefined
      ? undefined
      : value === null
        ? null
        : new Prisma.Decimal(value);
  return Object.fromEntries(
    Object.entries({
      videoFee: decimal(input.videoFee),
      chatFee: decimal(input.chatFee),
      homeVisitFee: decimal(input.homeVisitFee),
    }).filter(([, value]) => value !== undefined),
  );
}

function pick<T extends object, K extends keyof T>(
  source: T,
  keys: K[],
): Partial<Pick<T, K>> {
  const result: Partial<Pick<T, K>> = {};
  for (const key of keys) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

function mapUniqueError(error: unknown): unknown {
  if (isUniqueViolation(error, 'bmdcNo')) {
    return new AppException(
      DoctorsErrorCode.BMDC_NUMBER_TAKEN,
      'This BMDC number is already registered',
      HttpStatus.CONFLICT,
    );
  }
  if (isUniqueViolation(error, 'userId')) {
    return new AppException(
      DoctorsErrorCode.PROVIDER_PROFILE_EXISTS,
      'This account already has a provider profile',
      HttpStatus.CONFLICT,
    );
  }
  return error;
}
