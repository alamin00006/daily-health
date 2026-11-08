import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { emitAuditEvent } from '../../common/events/audit-event.js';
import { AppException } from '../../common/errors/app-exception.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { Prisma, ProfileMember } from '../../generated/prisma/client.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import type {
  ProfileMemberResponse,
  UpdateMemberRequest,
} from '../../shared-contracts/profiles.contract.js';
import { UserAccountsService } from '../auth/user-accounts.service.js';
import type { ProfileAccess } from './profile-access.service.js';
import { UsersErrorCode } from './users-error-codes.js';

@Injectable()
export class ProfileMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: UserAccountsService,
    private readonly events: EventEmitter2,
  ) {}

  async list(
    access: ProfileAccess,
  ): Promise<PaginatedResponse<ProfileMemberResponse>> {
    const profileId = access.profile.id;
    const members = await this.prisma.profileMember.findMany({
      where: { profileId },
      orderBy: { joinedAt: 'asc' },
    });
    const userIds = members.map((m) => m.userId);
    const [accounts, ownProfiles] = await Promise.all([
      this.accounts.findManyByIds(userIds),
      this.prisma.patientProfile.findMany({
        where: { linkedUserId: { in: userIds }, deletedAt: null },
        select: { linkedUserId: true, fullName: true },
      }),
    ]);
    const nameByUser = new Map(
      ownProfiles.map((p) => [p.linkedUserId, p.fullName]),
    );

    return {
      data: members.map((member) => ({
        userId: member.userId,
        email: accounts.get(member.userId)?.email ?? null,
        displayName: nameByUser.get(member.userId) ?? null,
        role: member.role,
        relation: member.relation,
        receivesAlerts: member.receivesAlerts,
        isPatient: access.profile.linkedUserId === member.userId,
        joinedAt: member.joinedAt.toISOString(),
      })),
      meta: { cursor: null, hasMore: false },
    };
  }

  /**
   * - role: only an OWNER may change it, and never so that no OWNER is left.
   * - relation, receivesAlerts: personal settings, only the member themself.
   */
  async update(
    actorUserId: string,
    access: ProfileAccess,
    targetUserId: string,
    input: UpdateMemberRequest,
  ): Promise<ProfileMemberResponse> {
    const isSelf = actorUserId === targetUserId;
    const actorIsOwner = access.membership.role === 'OWNER';
    if (input.role !== undefined && !actorIsOwner)
      throw accessDenied('Only an OWNER can change roles');
    if (
      (input.relation !== undefined || input.receivesAlerts !== undefined) &&
      !isSelf
    ) {
      throw accessDenied(
        'Members change their own relation and alert settings',
      );
    }

    const profileId = access.profile.id;
    const updated = await this.prisma.$transaction(async (tx) => {
      await lockProfile(tx, profileId);
      const target = await findMember(tx, profileId, targetUserId);
      if (input.role && target.role === 'OWNER' && input.role !== 'OWNER') {
        await assertAnotherOwner(tx, profileId, targetUserId);
      }
      return tx.profileMember.update({
        where: { profileId_userId: { profileId, userId: targetUserId } },
        data: {
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.relation !== undefined ? { relation: input.relation } : {}),
          ...(input.receivesAlerts !== undefined
            ? { receivesAlerts: input.receivesAlerts }
            : {}),
        },
      });
    });

    emitAuditEvent(this.events, {
      actorUserId,
      patientId: profileId,
      action: 'profile.member.update',
      entityType: 'ProfileMember',
      entityId: targetUserId,
      meta: { fields: Object.keys(input).sort().join(','), role: updated.role },
    });

    const account = await this.accounts.findById(targetUserId);
    const ownProfile = await this.prisma.patientProfile.findFirst({
      where: { linkedUserId: targetUserId, deletedAt: null },
      select: { fullName: true },
    });
    return {
      userId: updated.userId,
      email: account?.email ?? null,
      displayName: ownProfile?.fullName ?? null,
      role: updated.role,
      relation: updated.relation,
      receivesAlerts: updated.receivesAlerts,
      isPatient: access.profile.linkedUserId === updated.userId,
      joinedAt: updated.joinedAt.toISOString(),
    };
  }

  /** An OWNER removes someone, or a member leaves. The last OWNER cannot go. */
  async remove(
    actorUserId: string,
    access: ProfileAccess,
    targetUserId: string,
  ): Promise<void> {
    const isSelf = actorUserId === targetUserId;
    if (!isSelf && access.membership.role !== 'OWNER') {
      throw accessDenied('Only an OWNER can remove other members');
    }

    const profileId = access.profile.id;
    await this.prisma.$transaction(async (tx) => {
      await lockProfile(tx, profileId);
      const target = await findMember(tx, profileId, targetUserId);
      if (target.role === 'OWNER')
        await assertAnotherOwner(tx, profileId, targetUserId);

      await tx.profileMember.delete({
        where: { profileId_userId: { profileId, userId: targetUserId } },
      });
      // A patient who leaves their own profile is no longer linked to it.
      await tx.patientProfile.updateMany({
        where: { id: profileId, linkedUserId: targetUserId },
        data: { linkedUserId: null },
      });
    });

    emitAuditEvent(this.events, {
      actorUserId,
      patientId: profileId,
      action: isSelf ? 'profile.member.leave' : 'profile.member.remove',
      entityType: 'ProfileMember',
      entityId: targetUserId,
    });
  }
}

/** Serialises membership changes per profile, so "at least one OWNER" cannot be raced. */
export async function lockProfile(
  tx: Prisma.TransactionClient,
  profileId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "users"."PatientProfile" WHERE "id" = ${profileId}::uuid FOR UPDATE`;
}

async function findMember(
  tx: Prisma.TransactionClient,
  profileId: string,
  userId: string,
): Promise<ProfileMember> {
  const member = await tx.profileMember.findUnique({
    where: { profileId_userId: { profileId, userId } },
  });
  if (!member) {
    throw new AppException(
      UsersErrorCode.MEMBER_NOT_FOUND,
      'Member not found',
      HttpStatus.NOT_FOUND,
    );
  }
  return member;
}

async function assertAnotherOwner(
  tx: Prisma.TransactionClient,
  profileId: string,
  exceptUserId: string,
): Promise<void> {
  const otherOwners = await tx.profileMember.count({
    where: { profileId, role: 'OWNER', userId: { not: exceptUserId } },
  });
  if (otherOwners === 0) {
    throw new AppException(
      UsersErrorCode.LAST_OWNER,
      'A profile needs at least one OWNER; make someone else OWNER first',
      HttpStatus.CONFLICT,
    );
  }
}

function accessDenied(message: string): AppException {
  return new AppException(
    UsersErrorCode.PROFILE_ACCESS_DENIED,
    message,
    HttpStatus.FORBIDDEN,
  );
}
