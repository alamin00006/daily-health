import { randomBytes } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { emitAuditEvent } from '../../common/events/audit-event.js';
import { AppException } from '../../common/errors/app-exception.js';
import {
  afterCursor,
  toKeysetPage,
} from '../../common/pagination/keyset-cursor.js';
import { AppConfigService } from '../../core/config/app-config.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { HealthCard } from '../../generated/prisma/client.js';
import type {
  PaginatedResponse,
  PaginationQuery,
} from '../../shared-contracts/common-fields.contract.js';
import type {
  HealthCardAccessResponse,
  HealthCardResponse,
  HealthCardScanResponse,
  HealthCardStatusResponse,
  IssueHealthCardRequest,
} from '../../shared-contracts/health.contract.js';
import { PatientProfilesService } from '../users/patient-profiles.service.js';
import type { ProfileAccess } from '../users/profile-access.service.js';
import { HealthProfileErrorCode } from './health-profile-error-codes.js';
import { MedicalConditionsService } from './medical-conditions.service.js';

/** 24 random bytes → 32 URL-safe characters: not guessable within the rate limit. */
const QR_TOKEN_BYTES = 24;
const QR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const DAY_MS = 24 * 60 * 60_000;

export interface ScanRequestInfo {
  viewerUserId: string | null;
  ip: string | null;
}

/**
 * QR digital health card. The QR code holds only a random token; whoever scans
 * it (an emergency doctor) sees the emergency summary, and every scan is logged
 * in HealthCardAccess for the profile's members to review.
 */
@Injectable()
export class HealthCardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly conditions: MedicalConditionsService,
    private readonly profiles: PatientProfilesService,
    private readonly events: EventEmitter2,
  ) {}

  async status(
    userId: string,
    access: ProfileAccess,
  ): Promise<HealthCardStatusResponse> {
    const card = await this.prisma.healthCard.findUnique({
      where: { patientId: access.profile.id },
    });
    if (card) this.audit(userId, access, 'health-card.view', card.id);
    return { card: card ? this.toResponse(card) : null };
  }

  /**
   * Issues the card, or replaces it: the new token makes any printed or
   * shared copy of the old QR code stop working.
   */
  async issue(
    userId: string,
    access: ProfileAccess,
    input: IssueHealthCardRequest,
  ): Promise<HealthCardResponse> {
    const fields = {
      qrToken: randomBytes(QR_TOKEN_BYTES).toString('base64url'),
      isActive: true,
      expiresAt: input.validForDays
        ? new Date(Date.now() + input.validForDays * DAY_MS)
        : null,
    };
    const card = await this.prisma.healthCard.upsert({
      where: { patientId: access.profile.id },
      create: { patientId: access.profile.id, ...fields },
      update: fields,
    });
    this.audit(userId, access, 'health-card.issue', card.id);
    return this.toResponse(card);
  }

  /** The QR code stops working until a new card is issued. */
  async revoke(userId: string, access: ProfileAccess): Promise<void> {
    const { count } = await this.prisma.healthCard.updateMany({
      where: { patientId: access.profile.id, isActive: true },
      data: { isActive: false },
    });
    if (count === 0) throw cardNotFound();
    this.audit(userId, access, 'health-card.revoke', access.profile.id);
  }

  /** Who scanned the card, newest first. */
  async accesses(
    userId: string,
    access: ProfileAccess,
    query: PaginationQuery,
  ): Promise<PaginatedResponse<HealthCardAccessResponse>> {
    const card = await this.prisma.healthCard.findUnique({
      where: { patientId: access.profile.id },
      select: { id: true },
    });
    if (!card) throw cardNotFound();

    const rows = await this.prisma.healthCardAccess.findMany({
      where: {
        healthCardId: card.id,
        ...afterCursor('accessedAt', query.cursor),
      },
      orderBy: [{ accessedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    this.audit(userId, access, 'health-card.accesses.view', card.id);
    return toKeysetPage(
      rows,
      query.limit,
      (row) => row.accessedAt,
      (row) => ({
        id: row.id,
        byLoggedInUser: row.viewerUserId !== null,
        accessedAt: row.accessedAt.toISOString(),
      }),
    );
  }

  /**
   * Public: the emergency summary behind a QR code. Unknown, revoked and
   * expired cards, and deleted profiles, all get the same 404.
   */
  async scan(
    qrToken: string,
    request: ScanRequestInfo,
  ): Promise<HealthCardScanResponse> {
    if (!QR_TOKEN_PATTERN.test(qrToken)) throw cardNotFound();
    const card = await this.prisma.healthCard.findUnique({
      where: { qrToken },
    });
    if (
      !card ||
      !card.isActive ||
      (card.expiresAt && card.expiresAt <= new Date())
    ) {
      throw cardNotFound();
    }
    const profile = await this.profiles.findActiveById(card.patientId);
    if (!profile) throw cardNotFound();

    const [names] = await Promise.all([
      this.conditions.namesByKind(card.patientId),
      this.prisma.healthCardAccess.create({
        data: {
          healthCardId: card.id,
          viewerUserId: request.viewerUserId,
          ip: request.ip,
        },
      }),
    ]);
    emitAuditEvent(this.events, {
      actorUserId: request.viewerUserId,
      patientId: card.patientId,
      action: 'health-card.scan',
      entityType: 'HealthCard',
      entityId: card.id,
    });

    return {
      patientCode: profile.patientCode,
      fullName: profile.fullName,
      gender: profile.gender,
      ageYears: profile.dateOfBirth ? ageInYears(profile.dateOfBirth) : null,
      bloodGroup: profile.bloodGroup,
      chronicConditions: names.CHRONIC,
      allergies: names.ALLERGY,
      surgeries: names.SURGERY,
    };
  }

  private toResponse(card: HealthCard): HealthCardResponse {
    return {
      isActive: card.isActive,
      scanUrl: `${this.config.healthCardBaseUrl}/${card.qrToken}`,
      expiresAt: card.expiresAt ? card.expiresAt.toISOString() : null,
      issuedAt: card.updatedAt.toISOString(),
    };
  }

  private audit(
    userId: string,
    access: ProfileAccess,
    action: string,
    entityId: string,
  ): void {
    emitAuditEvent(this.events, {
      actorUserId: userId,
      patientId: access.profile.id,
      action,
      entityType: 'HealthCard',
      entityId,
    });
  }
}

/** Whole years on today's date in Asia/Dhaka. */
function ageInYears(dateOfBirth: Date): number {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
  }).format(new Date());
  const [year, month, day] = today.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  let age = year - dateOfBirth.getUTCFullYear();
  const birthdayPassed =
    month > dateOfBirth.getUTCMonth() + 1 ||
    (month === dateOfBirth.getUTCMonth() + 1 &&
      day >= dateOfBirth.getUTCDate());
  if (!birthdayPassed) age -= 1;
  return Math.max(age, 0);
}

function cardNotFound(): AppException {
  return new AppException(
    HealthProfileErrorCode.HEALTH_CARD_NOT_FOUND,
    'Health card not found',
    HttpStatus.NOT_FOUND,
  );
}
