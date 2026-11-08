import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { emitAuditEvent } from '../../common/events/audit-event.js';
import { AppException } from '../../common/errors/app-exception.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { ReadableIdService } from '../../core/readable-ids/readable-id.service.js';
import { StoredUploadsService } from '../../core/uploads/stored-uploads.service.js';
import { UploadedFileProcessorService } from '../../core/uploads/uploaded-file-processor.service.js';
import {
  Prisma,
  type PatientProfile,
  type ProfileMember,
} from '../../generated/prisma/client.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import type {
  CreateProfileRequest,
  PatientProfileResponse,
  UpdateProfileRequest,
} from '../../shared-contracts/profiles.contract.js';
import type { ProfileAccess } from './profile-access.service.js';
import { UsersErrorCode } from './users-error-codes.js';

/** Emitted after soft delete, so other modules can stop reminders etc. */
export const PROFILE_DELETED_EVENT = 'profile.deleted';
export interface ProfileDeletedEvent {
  profileId: string;
  deletedByUserId: string;
}

/** Profile photos are always stored as WebP (UploadedFileProcessorService). */
const AVATAR_MIME_TYPE = 'image/webp';

@Injectable()
export class PatientProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly uploadProcessor: UploadedFileProcessorService,
    private readonly uploads: StoredUploadsService,
    private readonly readableIds: ReadableIdService,
  ) {}

  /** The creator becomes OWNER. relation SELF links the profile to the creator's account. */
  async create(
    userId: string,
    input: CreateProfileRequest,
  ): Promise<PatientProfileResponse> {
    const isSelf = input.relation === 'SELF';

    try {
      const member = await this.prisma.$transaction(async (tx) => {
        const profile = await tx.patientProfile.create({
          data: {
            ...profileData(input),
            // PR-2611-0042: next patient number this month (readable-id.contract.ts).
            patientCode: await this.readableIds.next(
              'PATIENT',
              input.fullName,
              tx,
            ),
            fullName: input.fullName,
            gender: input.gender,
            linkedUserId: isSelf ? userId : null,
            createdByUserId: userId,
          },
        });
        return tx.profileMember.create({
          data: {
            profileId: profile.id,
            userId,
            role: 'OWNER',
            relation: input.relation,
            receivesAlerts: true,
          },
          include: { profile: true },
        });
      });

      emitAuditEvent(this.events, {
        actorUserId: userId,
        patientId: member.profileId,
        action: 'profile.create',
        entityType: 'PatientProfile',
        entityId: member.profileId,
      });
      return this.toResponse(member.profile, member);
    } catch (error) {
      if (isUniqueViolation(error, 'linkedUserId')) {
        throw new AppException(
          UsersErrorCode.OWN_PROFILE_ALREADY_EXISTS,
          'You already have your own profile',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  /** All profiles the user is a member of (bounded: a family has a handful). */
  async listForUser(
    userId: string,
  ): Promise<PaginatedResponse<PatientProfileResponse>> {
    const memberships = await this.prisma.profileMember.findMany({
      where: { userId, profile: { deletedAt: null } },
      include: { profile: true },
      orderBy: [{ joinedAt: 'asc' }],
    });
    // The caller's own profile first, then family in the order they were added.
    memberships.sort(
      (a, b) => Number(b.relation === 'SELF') - Number(a.relation === 'SELF'),
    );
    return {
      data: memberships.map((m) => this.toResponse(m.profile, m)),
      meta: { cursor: null, hasMore: false },
    };
  }

  view(userId: string, access: ProfileAccess): PatientProfileResponse {
    emitAuditEvent(this.events, {
      actorUserId: userId,
      patientId: access.profile.id,
      action: 'profile.view',
      entityType: 'PatientProfile',
      entityId: access.profile.id,
    });
    return this.toResponse(access.profile, access.membership);
  }

  async update(
    userId: string,
    access: ProfileAccess,
    input: UpdateProfileRequest,
  ): Promise<PatientProfileResponse> {
    const profile = await this.prisma.patientProfile.update({
      where: { id: access.profile.id },
      data: {
        ...profileData(input),
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.gender !== undefined ? { gender: input.gender } : {}),
      },
    });
    emitAuditEvent(this.events, {
      actorUserId: userId,
      patientId: profile.id,
      action: 'profile.update',
      entityType: 'PatientProfile',
      entityId: profile.id,
      // Field names only, never the values.
      meta: { fields: Object.keys(input).sort().join(',') },
    });
    return this.toResponse(profile, access.membership);
  }

  /**
   * Replaces the profile photo (OWNER, CAREGIVER). Cropped to a square WebP
   * with thumbnails and stored privately; the old photo is deleted afterwards.
   */
  async setAvatar(
    userId: string,
    access: ProfileAccess,
    file: Buffer,
  ): Promise<PatientProfileResponse> {
    const processed = await this.uploadProcessor.process(file, {
      allowPdf: false,
      avatar: true,
    });
    const storageKey = await this.uploads.store(processed, 'private');

    let profile: PatientProfile;
    try {
      profile = await this.prisma.patientProfile.update({
        where: { id: access.profile.id },
        data: { avatarStorageKey: storageKey },
      });
    } catch (error) {
      await this.uploads.remove(storageKey, processed.mimeType);
      throw error;
    }
    const previousKey = access.profile.avatarStorageKey;
    if (previousKey) await this.uploads.remove(previousKey, AVATAR_MIME_TYPE);

    emitAuditEvent(this.events, {
      actorUserId: userId,
      patientId: profile.id,
      action: 'profile.avatar.update',
      entityType: 'PatientProfile',
      entityId: profile.id,
    });
    return this.toResponse(profile, access.membership);
  }

  /** Idempotent: no photo is not an error. */
  async removeAvatar(userId: string, access: ProfileAccess): Promise<void> {
    const storageKey = access.profile.avatarStorageKey;
    if (!storageKey) return;
    await this.prisma.patientProfile.update({
      where: { id: access.profile.id },
      data: { avatarStorageKey: null },
    });
    await this.uploads.remove(storageKey, AVATAR_MIME_TYPE);
    emitAuditEvent(this.events, {
      actorUserId: userId,
      patientId: access.profile.id,
      action: 'profile.avatar.delete',
      entityType: 'PatientProfile',
      entityId: access.profile.id,
    });
  }

  /**
   * Soft delete: rows in other modules keep their patientId. The link to the
   * patient's account is released so they can create a new own profile.
   */
  async softDelete(userId: string, access: ProfileAccess): Promise<void> {
    const profileId = access.profile.id;
    await this.prisma.$transaction([
      this.prisma.patientProfile.update({
        where: { id: profileId },
        data: { deletedAt: new Date(), linkedUserId: null },
      }),
      this.prisma.profileInvite.updateMany({
        where: { profileId, status: 'PENDING' },
        data: { status: 'REVOKED', respondedAt: new Date() },
      }),
    ]);
    emitAuditEvent(this.events, {
      actorUserId: userId,
      patientId: profileId,
      action: 'profile.delete',
      entityType: 'PatientProfile',
      entityId: profileId,
    });
    this.events.emit(PROFILE_DELETED_EVENT, {
      profileId,
      deletedByUserId: userId,
    } satisfies ProfileDeletedEvent);
  }

  /**
   * For other modules that authorize by other means (a valid health card
   * token): the profile if it exists and is not deleted. No member check.
   */
  findActiveById(profileId: string): Promise<PatientProfile | null> {
    return this.prisma.patientProfile.findFirst({
      where: { id: profileId, deletedAt: null },
    });
  }

  /**
   * Profiles by id for other modules (names in reviews, a provider's patient
   * list). Includes deleted ones: past bookings still need a name.
   */
  async findManyByIds(
    profileIds: string[],
  ): Promise<Map<string, PatientProfile>> {
    if (profileIds.length === 0) return new Map();
    const rows = await this.prisma.patientProfile.findMany({
      where: { id: { in: [...new Set(profileIds)] } },
    });
    return new Map(rows.map((row) => [row.id, row]));
  }

  toResponse(
    profile: PatientProfile,
    member: Pick<ProfileMember, 'role' | 'relation' | 'receivesAlerts'>,
  ): PatientProfileResponse {
    const avatarKey = profile.avatarStorageKey;
    return {
      id: profile.id,
      patientCode: profile.patientCode,
      fullName: profile.fullName,
      gender: profile.gender,
      dateOfBirth: profile.dateOfBirth
        ? profile.dateOfBirth.toISOString().slice(0, 10)
        : null,
      bloodGroup: profile.bloodGroup,
      heightCm: profile.heightCm ? profile.heightCm.toNumber() : null,
      district: profile.district,
      avatarUrl: avatarKey ? this.uploads.thumbnailUrl(avatarKey, 800) : null,
      avatarThumbnailUrl: avatarKey
        ? this.uploads.thumbnailUrl(avatarKey, 200)
        : null,
      hasLinkedAccount: profile.linkedUserId !== null,
      myRole: member.role,
      myRelation: member.relation,
      receivesAlerts: member.receivesAlerts,
      createdAt: profile.createdAt.toISOString(),
    };
  }
}

/** Optional fields: undefined = leave as is, null = clear. */
function profileData(input: Partial<UpdateProfileRequest>) {
  return {
    ...(input.dateOfBirth !== undefined
      ? {
          dateOfBirth: input.dateOfBirth
            ? new Date(`${input.dateOfBirth}T00:00:00.000Z`)
            : null,
        }
      : {}),
    ...(input.bloodGroup !== undefined ? { bloodGroup: input.bloodGroup } : {}),
    ...(input.heightCm !== undefined
      ? {
          heightCm:
            input.heightCm === null ? null : new Prisma.Decimal(input.heightCm),
        }
      : {}),
    ...(input.district !== undefined ? { district: input.district } : {}),
  };
}

export function isUniqueViolation(error: unknown, field: string): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false;
  }
  return JSON.stringify(error.meta ?? {}).includes(field);
}
