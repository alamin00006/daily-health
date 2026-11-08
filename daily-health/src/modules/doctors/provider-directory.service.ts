import { HttpStatus, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppException } from '../../common/errors/app-exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import {
  dateColumnToString,
  stringToDateColumn,
  timeColumnToHhmm,
  addDays,
} from '../../common/time/dhaka-time.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { StoredUploadsService } from '../../core/uploads/stored-uploads.service.js';
import type { Prisma, Provider } from '../../generated/prisma/client.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import type {
  ChamberResponse,
  ConsultationMode,
  ListSpecialtiesQuery,
  ProviderDetailResponse,
  ProviderSummaryResponse,
  ReviewResponse,
  SearchProvidersQuery,
  SpecialtyResponse,
} from '../../shared-contracts/doctors.contract.js';
import { PatientProfilesService } from '../users/patient-profiles.service.js';
import { DoctorsErrorCode } from './doctors-error-codes.js';
import {
  isBookableSchedule,
  modeFee,
  PROVIDER_SUMMARY_INCLUDE,
  toCalendarSchedule,
  toChamberResponse,
  toProviderDetail,
  toProviderSummary,
  toReviewResponse,
} from './provider-responses.js';
import {
  buildCalendar,
  type CalendarDay,
  type CalendarSession,
} from './session-calendar.js';

/** Fuzzy name matches considered before filters and paging. */
const MAX_NAME_MATCHES = 200;

/**
 * Search results are ranked (online now, rating, name similarity), which a
 * keyset cursor cannot follow, so the cursor carries an offset. It stays
 * opaque to clients like every other cursor.
 */
const offsetCursorSchema = z.object({ o: z.number().int().min(0) });

/** A session on a date with everything booking needs. */
export interface BookableSession extends CalendarSession {
  fee: number;
  chamber: ChamberResponse | null;
}

export interface BookableCalendarDay extends Omit<CalendarDay, 'sessions'> {
  sessions: BookableSession[];
}

/** The provider, schedule and chamber behind one booking request. */
export interface BookingContext {
  provider: Provider;
  providerUserId: string;
  session: BookableSession | null;
  /** Follow-up fee at the chamber, if lower. */
  followUpFee: number | null;
}

/**
 * Read side of the doctors module: patient search, provider pages, and the
 * provider data other modules need (appointments, notifications). Patients
 * only ever see VERIFIED providers.
 */
@Injectable()
export class ProviderDirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: StoredUploadsService,
    private readonly profiles: PatientProfilesService,
  ) {}

  async listSpecialties(
    query: ListSpecialtiesQuery,
  ): Promise<SpecialtyResponse[]> {
    const [specialties, counts] = await Promise.all([
      this.prisma.specialty.findMany({
        where: query.type ? { forType: query.type } : {},
        orderBy: [{ sortOrder: 'asc' }, { nameBn: 'asc' }],
      }),
      this.prisma.providerSpecialty.groupBy({
        by: ['specialtyId'],
        where: { provider: { verificationStatus: 'VERIFIED' } },
        _count: { _all: true },
      }),
    ]);
    const countById = new Map(
      counts.map((row) => [row.specialtyId, row._count._all]),
    );
    return specialties.map((specialty) => ({
      id: specialty.id,
      slug: specialty.slug,
      nameBn: specialty.nameBn,
      nameEn: specialty.nameEn,
      iconName: specialty.iconName,
      forType: specialty.forType,
      providerCount: countById.get(specialty.id) ?? 0,
    }));
  }

  async search(
    query: SearchProvidersQuery,
  ): Promise<PaginatedResponse<ProviderSummaryResponse>> {
    const offset = query.cursor ? decodeOffsetCursor(query.cursor) : 0;
    const nameIds = query.q ? await this.matchNames(query.q, query.type) : null;
    if (nameIds && nameIds.length === 0) {
      return { data: [], meta: { cursor: null, hasMore: false } };
    }

    const where: Prisma.ProviderWhereInput = {
      verificationStatus: 'VERIFIED',
      type: query.type,
      ...(nameIds ? { id: { in: nameIds } } : {}),
      ...(query.gender ? { gender: query.gender } : {}),
      ...(query.onlineNow ? { isOnline: true } : {}),
      ...(query.specialty
        ? { specialties: { some: { specialty: { slug: query.specialty } } } }
        : {}),
      ...(query.mode ? modeFilter(query.mode) : {}),
      ...(query.district
        ? {
            chambers: {
              some: {
                isActive: true,
                hospital: {
                  district: { equals: query.district, mode: 'insensitive' },
                },
              },
            },
          }
        : {}),
    };

    let rows: Awaited<ReturnType<typeof this.findSummaries>>;
    if (nameIds) {
      // Keep the similarity order from matchNames.
      const all = await this.findSummaries(where);
      const rank = new Map(nameIds.map((id, index) => [id, index]));
      rows = all
        .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
        .slice(offset, offset + query.limit + 1);
    } else {
      rows = await this.findSummaries(where, {
        orderBy: [
          { isOnline: 'desc' },
          { ratingAvg: 'desc' },
          { ratingCount: 'desc' },
          { id: 'asc' },
        ],
        skip: offset,
        take: query.limit + 1,
      });
    }

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      data: page.map((row) => toProviderSummary(row, this.uploads)),
      meta: {
        cursor: hasMore ? encodeOffsetCursor(offset + query.limit) : null,
        hasMore,
      },
    };
  }

  async detail(providerId: string): Promise<ProviderDetailResponse> {
    const provider = await this.prisma.provider.findFirst({
      where: { id: providerId, verificationStatus: 'VERIFIED' },
      include: PROVIDER_SUMMARY_INCLUDE,
    });
    if (!provider) throw providerNotFound();
    return toProviderDetail(
      provider,
      this.uploads,
      await this.latestReviews(provider.id, 3),
    );
  }

  async latestReviews(
    providerId: string,
    take: number,
    before?: { at: Date; id: string },
  ): Promise<ReviewResponse[]> {
    const reviews = await this.prisma.review.findMany({
      where: {
        providerId,
        status: 'VISIBLE',
        ...(before
          ? {
              OR: [
                { createdAt: { lt: before.at } },
                { createdAt: before.at, id: { lt: before.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    });
    const names = await this.profiles.findManyByIds(
      reviews.map((review) => review.patientId),
    );
    return reviews.map((review) =>
      toReviewResponse(review, names.get(review.patientId)?.fullName ?? ''),
    );
  }

  /** Summaries for ids (any verification status: past bookings keep showing). */
  async summariesByIds(
    providerIds: string[],
  ): Promise<Map<string, ProviderSummaryResponse>> {
    if (providerIds.length === 0) return new Map();
    const rows = await this.findSummaries({
      id: { in: [...new Set(providerIds)] },
    });
    return new Map(
      rows.map((row) => [row.id, toProviderSummary(row, this.uploads)]),
    );
  }

  async chambersByIds(
    chamberIds: string[],
  ): Promise<Map<string, ChamberResponse>> {
    if (chamberIds.length === 0) return new Map();
    const rows = await this.prisma.chamber.findMany({
      where: { id: { in: [...new Set(chamberIds)] } },
      include: { hospital: true },
    });
    return new Map(rows.map((row) => [row.id, toChamberResponse(row)]));
  }

  /** The provider row of a verified provider, for booking and favorites. */
  async requireVerified(providerId: string): Promise<Provider> {
    const provider = await this.prisma.provider.findFirst({
      where: { id: providerId, verificationStatus: 'VERIFIED' },
    });
    if (!provider) throw providerNotFound();
    return provider;
  }

  /** The caller's own provider profile (panel routes). */
  async requireOwn(userId: string): Promise<Provider> {
    const provider = await this.prisma.provider.findUnique({
      where: { userId },
    });
    if (!provider) {
      throw new AppException(
        DoctorsErrorCode.PROVIDER_PROFILE_NOT_FOUND,
        'Register as a provider first',
        HttpStatus.NOT_FOUND,
      );
    }
    return provider;
  }

  async findById(providerId: string): Promise<Provider | null> {
    return this.prisma.provider.findUnique({ where: { id: providerId } });
  }

  /**
   * Sessions of a verified provider from `from` for `days` days, with fees
   * and chambers. Only bookable schedules (active, chamber active).
   */
  async calendar(
    providerId: string,
    from: string,
    days: number,
    mode?: ConsultationMode,
  ): Promise<BookableCalendarDay[]> {
    const provider = await this.prisma.provider.findFirst({
      where: { id: providerId, verificationStatus: 'VERIFIED' },
      include: {
        schedules: {
          where: { isActive: true, ...(mode ? { mode } : {}) },
          include: { chamber: { include: { hospital: true } } },
        },
        exceptions: {
          where: {
            date: {
              gte: stringToDateColumn(from),
              lte: stringToDateColumn(addDays(from, days - 1)),
            },
          },
        },
      },
    });
    if (!provider) throw providerNotFound();

    const schedules = provider.schedules.filter(isBookableSchedule);
    const scheduleById = new Map(schedules.map((s) => [s.id, s]));
    const calendar = buildCalendar(
      schedules.map(toCalendarSchedule),
      provider.exceptions.map((e) => ({
        scheduleId: e.scheduleId,
        date: dateColumnToString(e.date),
        isOff: e.isOff,
        startTime: e.startTime ? timeColumnToHhmm(e.startTime) : null,
        endTime: e.endTime ? timeColumnToHhmm(e.endTime) : null,
        note: e.note,
      })),
      from,
      days,
    );

    return calendar.map((day) => ({
      ...day,
      sessions: day.sessions.flatMap((session) => {
        const schedule = scheduleById.get(session.schedule.id)!;
        const fee =
          schedule.mode === 'IN_PERSON'
            ? (schedule.chamber?.fee.toNumber() ?? null)
            : schedule.mode === 'HOME_VISIT' && !provider.offersHomeVisit
              ? null
              : modeFee(provider, schedule.mode);
        // A mode without a fee is not offered right now.
        if (fee === null) return [];
        return [
          {
            ...session,
            fee,
            chamber: schedule.chamber
              ? toChamberResponse(schedule.chamber)
              : null,
          },
        ];
      }),
    }));
  }

  /** Everything needed to book one schedule on one date. */
  async bookingContext(
    providerId: string,
    scheduleId: string,
    date: string,
  ): Promise<BookingContext> {
    const provider = await this.requireVerified(providerId);
    const [day] = await this.calendar(providerId, date, 1);
    const session =
      day?.sessions.find((s) => s.schedule.id === scheduleId) ?? null;
    let followUpFee: number | null = null;
    if (session?.chamber) followUpFee = session.chamber.followUpFee;
    return {
      provider,
      providerUserId: provider.userId,
      session,
      followUpFee,
    };
  }

  private findSummaries(
    where: Prisma.ProviderWhereInput,
    page: Pick<Prisma.ProviderFindManyArgs, 'orderBy' | 'skip' | 'take'> = {},
  ) {
    return this.prisma.provider.findMany({
      where,
      include: PROVIDER_SUMMARY_INCLUDE,
      ...page,
    });
  }

  /**
   * Provider ids whose name is like `q` (pg_trgm), best first. A BMDC number
   * ("A-12345") or a provider code ("DR-2611-0003") matches exactly.
   */
  private async matchNames(q: string, type: string): Promise<string[]> {
    const exact = q.toUpperCase().replace(/\s+/g, '');
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "providers"."Provider"
      WHERE "verificationStatus" = 'VERIFIED'
        AND "type"::text = ${type}
        AND (
          "displayName" ILIKE ${`%${escapeLike(q)}%`}
          OR "displayName" % ${q}
          OR upper(replace(coalesce("bmdcNo", ''), '-', '')) = replace(${exact}, '-', '')
          OR "providerCode" = ${exact}
        )
      ORDER BY similarity("displayName", ${q}) DESC, "ratingAvg" DESC
      LIMIT ${MAX_NAME_MATCHES}`;
    return rows.map((row) => row.id);
  }
}

/** Providers with a bookable schedule of this mode (and its fee). */
function modeFilter(mode: ConsultationMode): Prisma.ProviderWhereInput {
  const schedule = {
    schedules: {
      some: {
        mode,
        isActive: true,
        OR: [{ chamberId: null }, { chamber: { isActive: true } }],
      },
    },
  } satisfies Prisma.ProviderWhereInput;
  if (mode === 'VIDEO') return { ...schedule, videoFee: { not: null } };
  if (mode === 'CHAT') return { ...schedule, chatFee: { not: null } };
  if (mode === 'HOME_VISIT') {
    return { ...schedule, offersHomeVisit: true, homeVisitFee: { not: null } };
  }
  return schedule;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function encodeOffsetCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset })).toString('base64url');
}

function decodeOffsetCursor(cursor: string): number {
  try {
    return offsetCursorSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
    ).o;
  } catch {
    throw new AppException(
      ErrorCode.VALIDATION_FAILED,
      'Invalid cursor',
      HttpStatus.BAD_REQUEST,
      { issues: [{ path: 'cursor', code: 'invalid', message: 'Invalid cursor' }] },
    );
  }
}

export function providerNotFound(): AppException {
  return new AppException(
    DoctorsErrorCode.PROVIDER_NOT_FOUND,
    'Provider not found',
    HttpStatus.NOT_FOUND,
  );
}
