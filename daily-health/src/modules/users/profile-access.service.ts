import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type {
  PatientProfile,
  ProfileMember,
  ProfileRole,
} from '../../generated/prisma/client.js';
import { UsersErrorCode } from './users-error-codes.js';

/** What a caller wants to do with a profile (CLAUDE.md §1 "Family and caregivers"). */
export const ProfileAction = {
  /** Read the profile and its health data. */
  VIEW: 'VIEW',
  /** Add or change health data. */
  EDIT: 'EDIT',
  /** Invite, remove or change members. */
  MANAGE_MEMBERS: 'MANAGE_MEMBERS',
  DELETE: 'DELETE',
  /** Women's health data: only the patient themself (see canViewWomensHealth). */
  VIEW_WOMENS_HEALTH: 'VIEW_WOMENS_HEALTH',
} as const;
export type ProfileAction = (typeof ProfileAction)[keyof typeof ProfileAction];

const ROLE_ACTIONS: Record<ProfileRole, ReadonlySet<ProfileAction>> = {
  OWNER: new Set(['VIEW', 'EDIT', 'MANAGE_MEMBERS', 'DELETE']),
  CAREGIVER: new Set(['VIEW', 'EDIT']),
  VIEWER: new Set(['VIEW']),
};

export interface ProfileAccess {
  profile: PatientProfile;
  membership: ProfileMember;
}

/**
 * The single place that decides who may do what with a PatientProfile.
 * Every module calls assert() (directly or via @RequireProfileAccess) before
 * touching a profile's data; no module writes its own access check.
 */
@Injectable()
export class ProfileAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Throws PROFILE_NOT_FOUND (404) when the caller is not a member or the
   * profile is deleted, so profile ids cannot be probed; PROFILE_ACCESS_DENIED
   * (403) when the member's role does not allow the action.
   */
  async assert(
    userId: string,
    profileId: string,
    action: ProfileAction,
  ): Promise<ProfileAccess> {
    const membership = await this.prisma.profileMember.findUnique({
      where: { profileId_userId: { profileId, userId } },
      include: { profile: true },
    });
    if (!membership || membership.profile.deletedAt) {
      throw new AppException(
        UsersErrorCode.PROFILE_NOT_FOUND,
        'Profile not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const { profile, ...member } = membership;
    if (!isAllowed(action, member, profile, userId)) {
      throw new AppException(
        UsersErrorCode.PROFILE_ACCESS_DENIED,
        'Your role on this profile does not allow this',
        HttpStatus.FORBIDDEN,
      );
    }
    return { profile, membership: member };
  }

  /** Profile ids the user can at least VIEW (for list queries in other modules). */
  async viewableProfileIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.profileMember.findMany({
      where: { userId, profile: { deletedAt: null } },
      select: { profileId: true },
    });
    return rows.map((row) => row.profileId);
  }

  /** User ids that get missed-dose / emergency alerts for a profile. */
  async alertRecipientUserIds(profileId: string): Promise<string[]> {
    const rows = await this.prisma.profileMember.findMany({
      where: { profileId, receivesAlerts: true, profile: { deletedAt: null } },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }
}

/**
 * Women's health data: the patient's own linked account; if the patient has no
 * account, the OWNER. CAREGIVER and VIEWER never (CLAUDE.md §1).
 */
export function canViewWomensHealth(
  profile: Pick<PatientProfile, 'linkedUserId'>,
  member: Pick<ProfileMember, 'role'>,
  userId: string,
): boolean {
  if (profile.linkedUserId) return profile.linkedUserId === userId;
  return member.role === 'OWNER';
}

function isAllowed(
  action: ProfileAction,
  member: Pick<ProfileMember, 'role'>,
  profile: Pick<PatientProfile, 'linkedUserId'>,
  userId: string,
): boolean {
  if (action === ProfileAction.VIEW_WOMENS_HEALTH) {
    return canViewWomensHealth(profile, member, userId);
  }
  return ROLE_ACTIONS[member.role].has(action);
}
