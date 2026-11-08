import { timeColumnToHhmm } from '../../common/time/dhaka-time.js';
import type { StoredUploadsService } from '../../core/uploads/stored-uploads.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  ChamberResponse,
  ConsultationMode,
  HospitalResponse,
  ProviderDetailResponse,
  ProviderSummaryResponse,
  ReviewResponse,
  ScheduleResponse,
} from '../../shared-contracts/doctors.contract.js';
import type { CalendarSchedule } from './session-calendar.js';

/** Provider photos are public WebPs (no health data, shown in search). */
export const PROVIDER_AVATAR_MIME = 'image/webp';

/** What every provider response needs. */
export const PROVIDER_SUMMARY_INCLUDE = {
  specialties: {
    include: { specialty: true },
    orderBy: { specialty: { sortOrder: 'asc' } },
  },
  chambers: { include: { hospital: true } },
  schedules: { where: { isActive: true }, include: { chamber: true } },
} satisfies Prisma.ProviderInclude;

export type ProviderWithSummary = Prisma.ProviderGetPayload<{
  include: typeof PROVIDER_SUMMARY_INCLUDE;
}>;

type ChamberWithHospital = Prisma.ChamberGetPayload<{
  include: { hospital: true };
}>;
type ScheduleRow = Prisma.ScheduleGetPayload<object>;
type ReviewRow = Prisma.ReviewGetPayload<object>;

const MODE_ORDER: ConsultationMode[] = [
  'IN_PERSON',
  'VIDEO',
  'CHAT',
  'HOME_VISIT',
];

export function toHospitalResponse(
  hospital: Prisma.HospitalGetPayload<object>,
): HospitalResponse {
  return {
    id: hospital.id,
    name: hospital.name,
    address: hospital.address,
    district: hospital.district,
    lat: hospital.lat?.toNumber() ?? null,
    lng: hospital.lng?.toNumber() ?? null,
    phone: hospital.phone,
  };
}

export function toChamberResponse(
  chamber: ChamberWithHospital,
): ChamberResponse {
  return {
    id: chamber.id,
    hospital: toHospitalResponse(chamber.hospital),
    room: chamber.room,
    fee: chamber.fee.toNumber(),
    followUpFee: chamber.followUpFee?.toNumber() ?? null,
    isActive: chamber.isActive,
  };
}

export function toScheduleResponse(schedule: ScheduleRow): ScheduleResponse {
  return {
    id: schedule.id,
    mode: schedule.mode,
    chamberId: schedule.chamberId,
    dayOfWeek: schedule.dayOfWeek,
    startTime: timeColumnToHhmm(schedule.startTime),
    endTime: timeColumnToHhmm(schedule.endTime),
    slotMinutes: schedule.slotMinutes,
    maxPatients: schedule.maxPatients,
    isActive: schedule.isActive,
  };
}

export function toCalendarSchedule(schedule: ScheduleRow): CalendarSchedule {
  return {
    id: schedule.id,
    mode: schedule.mode,
    chamberId: schedule.chamberId,
    dayOfWeek: schedule.dayOfWeek,
    startTime: timeColumnToHhmm(schedule.startTime),
    endTime: timeColumnToHhmm(schedule.endTime),
    slotMinutes: schedule.slotMinutes,
    maxPatients: schedule.maxPatients,
  };
}

/** A schedule patients can book: active, and its chamber (if any) active. */
export function isBookableSchedule(
  schedule: ScheduleRow & { chamber: { isActive: boolean } | null },
): boolean {
  return schedule.isActive && (schedule.chamber?.isActive ?? true);
}

/** Fee of one mode, or null when not offered. */
export function modeFee(
  provider: Pick<ProviderWithSummary, 'videoFee' | 'chatFee' | 'homeVisitFee'>,
  mode: Exclude<ConsultationMode, 'IN_PERSON'>,
): number | null {
  const fee =
    mode === 'VIDEO'
      ? provider.videoFee
      : mode === 'CHAT'
        ? provider.chatFee
        : provider.homeVisitFee;
  return fee?.toNumber() ?? null;
}

export function toProviderSummary(
  provider: ProviderWithSummary,
  uploads: StoredUploadsService,
): ProviderSummaryResponse {
  const activeChambers = provider.chambers.filter((c) => c.isActive);
  const bookable = provider.schedules.filter(isBookableSchedule);
  const modes = MODE_ORDER.filter((mode) =>
    bookable.some((s) => s.mode === mode),
  );
  const chamberFees = activeChambers.map((c) => c.fee.toNumber());
  return {
    id: provider.id,
    providerCode: provider.providerCode,
    type: provider.type,
    gender: provider.gender,
    displayName: provider.displayName,
    designation: provider.designation,
    qualifications: provider.qualifications,
    bmdcNo: provider.bmdcNo,
    experienceYears: provider.experienceYears,
    avatarUrl: provider.avatarStorageKey
      ? uploads.urls(provider.avatarStorageKey, PROVIDER_AVATAR_MIME).url
      : null,
    avatarThumbnailUrl: provider.avatarStorageKey
      ? uploads.thumbnailUrl(provider.avatarStorageKey, 200)
      : null,
    specialties: provider.specialties.map(({ specialty }) => ({
      id: specialty.id,
      slug: specialty.slug,
      nameBn: specialty.nameBn,
    })),
    ratingAvg: provider.ratingAvg.toNumber(),
    ratingCount: provider.ratingCount,
    isOnline: provider.isOnline,
    fees: {
      inPersonFrom: chamberFees.length ? Math.min(...chamberFees) : null,
      video: modeFee(provider, 'VIDEO'),
      chat: modeFee(provider, 'CHAT'),
      homeVisit: provider.offersHomeVisit
        ? modeFee(provider, 'HOME_VISIT')
        : null,
    },
    modes,
    districts: [...new Set(activeChambers.map((c) => c.hospital.district))],
  };
}

/** "রহিম উদ্দিন" → "রহিম উ."; reviews never show the full name. */
export function reviewAuthorLabel(fullName: string): string {
  const [first, second] = fullName.trim().split(/\s+/);
  if (!first) return 'রোগী';
  if (!second) return first;
  return `${first} ${Array.from(second)[0] ?? ''}.`;
}

export function toReviewResponse(
  review: ReviewRow,
  authorName: string,
): ReviewResponse {
  return {
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    authorLabel: reviewAuthorLabel(authorName),
    createdAt: review.createdAt.toISOString(),
  };
}

export function toProviderDetail(
  provider: ProviderWithSummary,
  uploads: StoredUploadsService,
  latestReviews: ReviewResponse[],
): ProviderDetailResponse {
  return {
    ...toProviderSummary(provider, uploads),
    bio: provider.bio,
    acceptsQuickConsult: provider.acceptsQuickConsult,
    offersHomeVisit: provider.offersHomeVisit,
    chambers: provider.chambers
      .filter((c) => c.isActive)
      .map(toChamberResponse),
    schedules: provider.schedules
      .filter(isBookableSchedule)
      .map(toScheduleResponse)
      .sort(
        (a, b) =>
          a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime),
      ),
    latestReviews,
  };
}
