import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { CommunitySpace } from '../../generated/prisma/client.js';
import type { CommunityAccessResponse } from '../../shared-contracts/community.contract.js';
import { PatientProfilesService } from '../users/patient-profiles.service.js';
import { CommunityErrorCode } from './community-error-codes.js';

/** Who may read and write where (CLAUDE.md §1, feature 9). */
@Injectable()
export class CommunityAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: PatientProfilesService,
  ) {}

  isStaff(user: AuthenticatedUser | null): boolean {
    return user?.role === 'ADMIN' || user?.role === 'MODERATOR';
  }

  async isWomenMember(userId: string): Promise<boolean> {
    const row = await this.prisma.womenCommunityMember.findUnique({ where: { userId } });
    if (row?.status !== 'APPROVED') return false;
    const ban = await this.prisma.communityBan.findFirst({ where: { userId, scope: { in: ['ALL', 'WOMEN'] } } });
    return !ban;
  }

  /** The spaces the caller can read: COMMON for everyone; WOMEN for members and staff. */
  async readableSpaces(user: AuthenticatedUser | null): Promise<CommunitySpace[]> {
    if (!user || user.isGuest) return ['COMMON'];
    if (this.isStaff(user) || (await this.isWomenMember(user.userId))) return ['COMMON', 'WOMEN'];
    return ['COMMON'];
  }

  async assertCanRead(user: AuthenticatedUser | null, space: CommunitySpace): Promise<void> {
    if (!(await this.readableSpaces(user)).includes(space)) throw membersOnly();
  }

  /** Registered, not banned, and a member for WOMEN. Staff moderate but also may post. */
  async assertCanWrite(user: AuthenticatedUser, space: CommunitySpace): Promise<void> {
    const bans = await this.prisma.communityBan.findMany({ where: { userId: user.userId } });
    if (bans.some((b) => b.scope === 'ALL') || (space === 'WOMEN' && bans.some((b) => b.scope === 'WOMEN'))) {
      throw new AppException(CommunityErrorCode.COMMUNITY_BANNED, 'Posting is blocked for this account', HttpStatus.FORBIDDEN, {
        reason: bans[0]?.reason ?? null,
      });
    }
    if (space === 'WOMEN' && !this.isStaff(user) && !(await this.isWomenMember(user.userId))) throw membersOnly();
  }

  async access(user: AuthenticatedUser | null): Promise<CommunityAccessResponse> {
    if (!user || user.isGuest) {
      return {
        canPost: false,
        bannedReason: null,
        women: { status: 'NONE', canRequest: false, blockedReason: 'NO_OWN_PROFILE', note: null },
      };
    }
    const [bans, membership, own] = await Promise.all([
      this.prisma.communityBan.findMany({ where: { userId: user.userId } }),
      this.prisma.womenCommunityMember.findUnique({ where: { userId: user.userId } }),
      this.profiles.ownProfileOf(user.userId),
    ]);
    const allBan = bans.find((b) => b.scope === 'ALL');
    const womenBanned = Boolean(allBan) || bans.some((b) => b.scope === 'WOMEN');
    const blockedReason = !own ? 'NO_OWN_PROFILE' : own.gender !== 'FEMALE' ? 'NOT_FEMALE' : womenBanned ? 'BANNED' : null;
    return {
      canPost: !allBan,
      bannedReason: allBan?.reason ?? null,
      women: {
        status: womenBanned && membership?.status === 'APPROVED' ? 'REMOVED' : (membership?.status ?? 'NONE'),
        // Asking again is possible after a rejection; a removal is final (moderators can re-add).
        canRequest: blockedReason === null && (!membership || membership.status === 'REJECTED'),
        blockedReason,
        note: membership?.decisionNote ?? null,
      },
    };
  }

  async requestWomenMembership(user: AuthenticatedUser, note: string | undefined): Promise<CommunityAccessResponse> {
    const current = await this.access(user);
    if (current.women.blockedReason) {
      throw new AppException(
        CommunityErrorCode.WOMEN_COMMUNITY_NOT_ELIGIBLE,
        'Only a user whose own profile is female can ask to join',
        HttpStatus.FORBIDDEN,
        { reason: current.women.blockedReason },
      );
    }
    if (!current.women.canRequest) {
      throw new AppException(CommunityErrorCode.WOMEN_COMMUNITY_REQUEST_EXISTS, 'Already asked or decided', HttpStatus.CONFLICT);
    }
    await this.prisma.womenCommunityMember.upsert({
      where: { userId: user.userId },
      create: { userId: user.userId, requestNote: note ?? null },
      update: {
        status: 'PENDING',
        requestNote: note ?? null,
        decisionNote: null,
        decidedByUserId: null,
        decidedAt: null,
        requestedAt: new Date(),
      },
    });
    return this.access(user);
  }
}

function membersOnly(): AppException {
  return new AppException(
    CommunityErrorCode.WOMEN_COMMUNITY_MEMBERS_ONLY,
    "The women's community is for approved members",
    HttpStatus.FORBIDDEN,
  );
}
