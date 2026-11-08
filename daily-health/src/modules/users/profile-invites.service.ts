import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { emitAuditEvent } from '../../common/events/audit-event.js';
import { AppException } from '../../common/errors/app-exception.js';
import { EmailOutboxService } from '../../core/mail/email-outbox.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type {
  PatientProfile,
  ProfileInvite,
} from '../../generated/prisma/client.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import type {
  CreateInviteRequest,
  PatientProfileResponse,
  ProfileInviteResponse,
} from '../../shared-contracts/profiles.contract.js';
import { UserAccountsService } from '../auth/user-accounts.service.js';
import {
  isUniqueViolation,
  PatientProfilesService,
} from './patient-profiles.service.js';
import type { ProfileAccess } from './profile-access.service.js';
import { lockProfile } from './profile-members.service.js';
import { profileInviteEmail } from './profile-invite-email-template.js';
import { UsersErrorCode } from './users-error-codes.js';

export const INVITE_TTL_DAYS = 7;

/**
 * Family members join through an invite sent to their email. Accepting needs a
 * logged-in account whose email equals `invitedEmail`; that email was proved
 * with an OTP at signup, so no extra code is needed here.
 */
@Injectable()
export class ProfileInvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: UserAccountsService,
    private readonly emails: EmailOutboxService,
    private readonly events: EventEmitter2,
    private readonly profiles: PatientProfilesService,
  ) {}

  async create(
    actorUserId: string,
    access: ProfileAccess,
    input: CreateInviteRequest,
  ): Promise<ProfileInviteResponse> {
    const { profile } = access;
    if (input.relation === 'SELF' && profile.linkedUserId) {
      throw new AppException(
        UsersErrorCode.PROFILE_ALREADY_LINKED,
        'This profile is already linked to the patient’s account',
        HttpStatus.CONFLICT,
      );
    }
    const existingAccount = await this.accounts.findByEmail(input.email);
    if (existingAccount) {
      const alreadyMember = await this.prisma.profileMember.findUnique({
        where: {
          profileId_userId: {
            profileId: profile.id,
            userId: existingAccount.id,
          },
        },
      });
      if (alreadyMember) {
        throw new AppException(
          UsersErrorCode.MEMBER_ALREADY_EXISTS,
          'This person is already a member',
          HttpStatus.CONFLICT,
        );
      }
    }

    const now = new Date();
    // Release the "one pending invite" slot held by an invite that ran out.
    await this.prisma.profileInvite.updateMany({
      where: {
        profileId: profile.id,
        invitedEmail: input.email,
        status: 'PENDING',
        expiresAt: { lte: now },
      },
      data: { status: 'EXPIRED' },
    });

    let invite: ProfileInvite;
    try {
      invite = await this.prisma.profileInvite.create({
        data: {
          profileId: profile.id,
          invitedEmail: input.email,
          role: input.role,
          relation: input.relation,
          invitedByUserId: actorUserId,
          expiresAt: new Date(now.getTime() + INVITE_TTL_DAYS * 86_400_000),
        },
      });
    } catch (error) {
      if (
        isUniqueViolation(error, 'invitedEmail') ||
        isUniqueViolation(error, 'one_pending')
      ) {
        throw new AppException(
          UsersErrorCode.INVITE_ALREADY_PENDING,
          'An invite to this email is already pending',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }

    await this.emails.enqueue(
      profileInviteEmail({
        to: input.email,
        profileName: profile.fullName,
        role: input.role,
        expiresInDays: INVITE_TTL_DAYS,
      }),
    );
    emitAuditEvent(this.events, {
      actorUserId,
      patientId: profile.id,
      action: 'profile.invite.create',
      entityType: 'ProfileInvite',
      entityId: invite.id,
      meta: { role: invite.role },
    });
    return toInviteResponse(invite, profile);
  }

  async listForProfile(
    access: ProfileAccess,
  ): Promise<PaginatedResponse<ProfileInviteResponse>> {
    const invites = await this.prisma.profileInvite.findMany({
      where: {
        profileId: access.profile.id,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      data: invites.map((invite) => toInviteResponse(invite, access.profile)),
      meta: { cursor: null, hasMore: false },
    };
  }

  async revoke(
    actorUserId: string,
    access: ProfileAccess,
    inviteId: string,
  ): Promise<void> {
    const { count } = await this.prisma.profileInvite.updateMany({
      where: { id: inviteId, profileId: access.profile.id, status: 'PENDING' },
      data: { status: 'REVOKED', respondedAt: new Date() },
    });
    if (count === 0) throw inviteNotFound();
    emitAuditEvent(this.events, {
      actorUserId,
      patientId: access.profile.id,
      action: 'profile.invite.revoke',
      entityType: 'ProfileInvite',
      entityId: inviteId,
    });
  }

  /** Pending invites addressed to the caller's verified email. */
  async listForInvitee(
    userId: string,
  ): Promise<PaginatedResponse<ProfileInviteResponse>> {
    const email = await this.verifiedEmailOf(userId);
    const invites = await this.prisma.profileInvite.findMany({
      where: {
        invitedEmail: email,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
        profile: { deletedAt: null },
      },
      include: { profile: true },
      orderBy: { createdAt: 'desc' },
    });
    return {
      data: invites.map((invite) => toInviteResponse(invite, invite.profile)),
      meta: { cursor: null, hasMore: false },
    };
  }

  /** Joins the profile. relation SELF also links the caller's account as the patient. */
  async accept(
    userId: string,
    inviteId: string,
  ): Promise<PatientProfileResponse> {
    const email = await this.verifiedEmailOf(userId);

    const member = await this.prisma.$transaction(async (tx) => {
      const invite = await tx.profileInvite.findUnique({
        where: { id: inviteId },
        include: { profile: true },
      });
      if (
        !invite ||
        invite.invitedEmail !== email ||
        invite.status !== 'PENDING' ||
        invite.profile.deletedAt
      ) {
        throw inviteNotFound();
      }
      // Expiry is evaluated lazily; the row's status is fixed up on the next create().
      if (invite.expiresAt <= new Date()) {
        throw new AppException(
          UsersErrorCode.INVITE_EXPIRED,
          'This invite has expired',
          HttpStatus.GONE,
        );
      }

      await lockProfile(tx, invite.profileId);
      const existing = await tx.profileMember.findUnique({
        where: { profileId_userId: { profileId: invite.profileId, userId } },
      });
      if (existing) {
        throw new AppException(
          UsersErrorCode.MEMBER_ALREADY_EXISTS,
          'You are already a member',
          HttpStatus.CONFLICT,
        );
      }

      if (invite.relation === 'SELF') {
        const profile = await tx.patientProfile.findUniqueOrThrow({
          where: { id: invite.profileId },
        });
        if (profile.linkedUserId) {
          throw new AppException(
            UsersErrorCode.PROFILE_ALREADY_LINKED,
            'This profile is already linked to another account',
            HttpStatus.CONFLICT,
          );
        }
        const ownProfile = await tx.patientProfile.findUnique({
          where: { linkedUserId: userId },
        });
        if (ownProfile) {
          throw new AppException(
            UsersErrorCode.OWN_PROFILE_ALREADY_EXISTS,
            'You already have your own profile',
            HttpStatus.CONFLICT,
          );
        }
        await tx.patientProfile.update({
          where: { id: invite.profileId },
          data: { linkedUserId: userId },
        });
      }

      await tx.profileInvite.update({
        where: { id: invite.id },
        data: {
          status: 'ACCEPTED',
          respondedAt: new Date(),
          acceptedByUserId: userId,
        },
      });
      return tx.profileMember.create({
        data: {
          profileId: invite.profileId,
          userId,
          role: invite.role,
          relation: invite.relation,
          receivesAlerts: invite.role !== 'VIEWER',
        },
        include: { profile: true },
      });
    });

    emitAuditEvent(this.events, {
      actorUserId: userId,
      patientId: member.profileId,
      action: 'profile.invite.accept',
      entityType: 'ProfileInvite',
      entityId: inviteId,
      meta: { role: member.role },
    });
    return this.profiles.toResponse(member.profile, member);
  }

  async decline(userId: string, inviteId: string): Promise<void> {
    const email = await this.verifiedEmailOf(userId);
    const { count } = await this.prisma.profileInvite.updateMany({
      where: { id: inviteId, invitedEmail: email, status: 'PENDING' },
      data: { status: 'DECLINED', respondedAt: new Date() },
    });
    if (count === 0) throw inviteNotFound();
  }

  private async verifiedEmailOf(userId: string): Promise<string> {
    const account = await this.accounts.findById(userId);
    // Guests are blocked by @RegisteredUsersOnly; this also covers unverified emails.
    if (!account?.email || !account.emailVerified) throw inviteNotFound();
    return account.email;
  }
}

function toInviteResponse(
  invite: ProfileInvite,
  profile: Pick<PatientProfile, 'fullName'>,
): ProfileInviteResponse {
  const expired = invite.status === 'PENDING' && invite.expiresAt <= new Date();
  return {
    id: invite.id,
    profileId: invite.profileId,
    profileName: profile.fullName,
    invitedEmail: invite.invitedEmail,
    role: invite.role,
    relation: invite.relation,
    status: expired ? 'EXPIRED' : invite.status,
    expiresAt: invite.expiresAt.toISOString(),
    createdAt: invite.createdAt.toISOString(),
  };
}

function inviteNotFound(): AppException {
  return new AppException(
    UsersErrorCode.INVITE_NOT_FOUND,
    'Invite not found',
    HttpStatus.NOT_FOUND,
  );
}
