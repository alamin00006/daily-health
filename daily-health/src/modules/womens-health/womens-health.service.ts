import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { emitAuditEvent } from '../../common/events/audit-event.js';
import { AppException } from '../../common/errors/app-exception.js';
import {
  addDays,
  dateColumnToString,
  dhakaDate,
  stringToDateColumn,
} from '../../common/time/dhaka-time.js';
import { ColumnEncryptionService } from '../../core/crypto/column-encryption.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import {
  Prisma,
  type CycleSettings,
  type DailyLog,
  type PeriodCycle,
  type PregnancyTracking,
} from '../../generated/prisma/client.js';
import {
  cycleGoalSchema,
  flowSchema,
  moodSchema,
  symptomSchema,
  type CreatePeriodRequest,
  type CycleOverviewResponse,
  type CycleSettingsResponse,
  type DailyLogResponse,
  type ListDailyLogsQuery,
  type PeriodResponse,
  type PregnancyResponse,
  type SaveDailyLogRequest,
  type StartPregnancyRequest,
  type UpdateCycleSettingsRequest,
  type UpdatePeriodRequest,
} from '../../shared-contracts/womens-health.contract.js';
import type { ProfileAccess } from '../users/profile-access.service.js';
import {
  cycleLengths,
  daysBetween,
  periodLength,
  predictCycle,
  pregnancyProgress,
  type PeriodDates,
} from './cycle-predictions.js';
import { WomensHealthErrorCode } from './womens-health-error-codes.js';

const ENC = {
  goal: 'womens_health.CycleSettings.goal',
  endDate: 'womens_health.PeriodCycle.endDate',
  flow: 'womens_health.DailyLog.flow',
  mood: 'womens_health.DailyLog.mood',
  symptoms: 'womens_health.DailyLog.symptoms',
  note: 'womens_health.DailyLog.note',
  lmpDate: 'womens_health.PregnancyTracking.lmpDate',
  dueDate: 'womens_health.PregnancyTracking.dueDate',
} as const;

const DEFAULT_SETTINGS = { avgCycleDays: 28, avgPeriodDays: 5 } as const;
/** Two period starts closer than this are the same period logged twice. */
const MIN_DAYS_BETWEEN_PERIODS = 10;
const MAX_PERIOD_DAYS = 15;
/** Enough history for the averages and the calendar. */
const PERIOD_HISTORY_LIMIT = 24;
const MAX_LOG_RANGE_DAYS = 92;
/** A pregnancy is tracked for at most ~42 weeks after the LMP. */
const MAX_PREGNANCY_DAYS = 294;

/**
 * Period tracker, daily log and pregnancy for one profile. The controller has
 * already asserted VIEW_WOMENS_HEALTH (the patient themself, or the OWNER of a
 * profile without its own account); CAREGIVER and VIEWER never get here.
 * Audit entries carry ids and action names only, never health values.
 */
@Injectable()
export class WomensHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: ColumnEncryptionService,
    private readonly events: EventEmitter2,
  ) {}

  // -------------------------------------------------------------------------
  // Overview & settings
  // -------------------------------------------------------------------------

  async overview(userId: string, access: ProfileAccess): Promise<CycleOverviewResponse> {
    ensureAvailable(access);
    const patientId = access.profile.id;
    const today = dhakaDate();
    const [settingsRow, periodRows, todayLog, pregnancyRow] = await Promise.all([
      this.prisma.cycleSettings.findUnique({ where: { patientId } }),
      this.recentPeriods(patientId),
      this.prisma.dailyLog.findUnique({
        where: { patientId_date: { patientId, date: stringToDateColumn(today) } },
      }),
      this.prisma.pregnancyTracking.findFirst({ where: { patientId, status: 'ACTIVE' } }),
    ]);
    const settings = this.settingsResponse(settingsRow);
    const periods = this.periodDates(periodRows);
    const prediction = predictCycle(periods, settings, today);
    const responses = this.periodResponses(periodRows, periods);
    this.audit(userId, access, 'womens-health.view', patientId);
    return {
      settings,
      ...prediction,
      lastPeriod: responses[0] ?? null,
      today: todayLog ? this.logResponse(todayLog) : null,
      pregnancy: pregnancyRow ? this.pregnancyResponse(pregnancyRow, today) : null,
    };
  }

  async updateSettings(
    userId: string,
    access: ProfileAccess,
    input: UpdateCycleSettingsRequest,
  ): Promise<CycleSettingsResponse> {
    ensureAvailable(access);
    const patientId = access.profile.id;
    const data = {
      ...(input.avgCycleDays !== undefined ? { avgCycleDays: input.avgCycleDays } : {}),
      ...(input.avgPeriodDays !== undefined ? { avgPeriodDays: input.avgPeriodDays } : {}),
      ...(input.goal !== undefined ? { goal: this.encryption.encrypt(input.goal, ENC.goal) } : {}),
      ...(input.appLockEnabled !== undefined ? { appLockEnabled: input.appLockEnabled } : {}),
      ...(input.remindersOn !== undefined ? { remindersOn: input.remindersOn } : {}),
    };
    const row = await this.prisma.cycleSettings.upsert({
      where: { patientId },
      create: { patientId, ...data },
      update: data,
    });
    this.audit(userId, access, 'womens-health.settings.update', patientId, {
      fields: Object.keys(input).sort().join(','),
    });
    return this.settingsResponse(row);
  }

  // -------------------------------------------------------------------------
  // Periods
  // -------------------------------------------------------------------------

  /** Latest first, with each cycle's length. */
  async listPeriods(userId: string, access: ProfileAccess): Promise<PeriodResponse[]> {
    ensureAvailable(access);
    const rows = await this.recentPeriods(access.profile.id);
    this.audit(userId, access, 'womens-health.period.view', access.profile.id);
    return this.periodResponses(rows, this.periodDates(rows));
  }

  async createPeriod(userId: string, access: ProfileAccess, input: CreatePeriodRequest): Promise<PeriodResponse> {
    ensureAvailable(access);
    const patientId = access.profile.id;
    const endDate = input.endDate ?? null;
    this.validatePeriodDates(input.startDate, endDate);
    await this.ensureNotTooClose(patientId, input.startDate);
    const row = await this.prisma.periodCycle
      .create({
        data: {
          patientId,
          startDate: stringToDateColumn(input.startDate),
          endDate: this.encryption.encryptNullable(endDate, ENC.endDate),
        },
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) throw periodTooClose();
        throw error;
      });
    this.audit(userId, access, 'womens-health.period.create', row.id);
    return this.findPeriodResponse(patientId, row.id);
  }

  async updatePeriod(
    userId: string,
    access: ProfileAccess,
    periodId: string,
    input: UpdatePeriodRequest,
  ): Promise<PeriodResponse> {
    ensureAvailable(access);
    const patientId = access.profile.id;
    const current = await this.findPeriod(patientId, periodId);
    const startDate = input.startDate ?? dateColumnToString(current.startDate);
    const endDate =
      input.endDate !== undefined ? input.endDate : this.encryption.decryptNullable(current.endDate, ENC.endDate);
    this.validatePeriodDates(startDate, endDate);
    if (input.startDate !== undefined) await this.ensureNotTooClose(patientId, startDate, periodId);
    await this.prisma.periodCycle
      .update({
        where: { id: periodId },
        data: {
          startDate: stringToDateColumn(startDate),
          endDate: this.encryption.encryptNullable(endDate, ENC.endDate),
        },
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) throw periodTooClose();
        throw error;
      });
    this.audit(userId, access, 'womens-health.period.update', periodId, {
      fields: Object.keys(input).sort().join(','),
    });
    return this.findPeriodResponse(patientId, periodId);
  }

  async removePeriod(userId: string, access: ProfileAccess, periodId: string): Promise<void> {
    ensureAvailable(access);
    const { count } = await this.prisma.periodCycle.deleteMany({
      where: { id: periodId, patientId: access.profile.id },
    });
    if (count === 0) throw periodNotFound();
    this.audit(userId, access, 'womens-health.period.delete', periodId);
  }

  // -------------------------------------------------------------------------
  // Daily log
  // -------------------------------------------------------------------------

  async listLogs(userId: string, access: ProfileAccess, query: ListDailyLogsQuery): Promise<DailyLogResponse[]> {
    ensureAvailable(access);
    if (daysBetween(query.from, query.to) > MAX_LOG_RANGE_DAYS) {
      throw new AppException('VALIDATION_FAILED', `At most ${MAX_LOG_RANGE_DAYS} days at a time`);
    }
    const rows = await this.prisma.dailyLog.findMany({
      where: {
        patientId: access.profile.id,
        date: { gte: stringToDateColumn(query.from), lte: stringToDateColumn(query.to) },
      },
      orderBy: { date: 'asc' },
    });
    this.audit(userId, access, 'womens-health.log.view', access.profile.id);
    return rows.map((row) => this.logResponse(row));
  }

  /**
   * Saves the day's flow, mood, symptoms and note (replacing what was there).
   * An empty log deletes the day, so un-ticking everything leaves no trace.
   */
  async saveLog(
    userId: string,
    access: ProfileAccess,
    date: string,
    input: SaveDailyLogRequest,
  ): Promise<DailyLogResponse | null> {
    ensureAvailable(access);
    if (date > dhakaDate()) throw dateInFuture();
    const patientId = access.profile.id;
    const key = { patientId_date: { patientId, date: stringToDateColumn(date) } };
    const symptoms = [...new Set(input.symptoms)];
    const note = input.note?.trim() || null;
    if (!input.flow && !input.mood && symptoms.length === 0 && !note) {
      await this.prisma.dailyLog.deleteMany({ where: { patientId, date: stringToDateColumn(date) } });
      this.audit(userId, access, 'womens-health.log.delete', patientId, { date });
      return null;
    }
    const data = {
      flow: this.encryption.encryptNullable(input.flow, ENC.flow),
      mood: this.encryption.encryptNullable(input.mood, ENC.mood),
      symptoms: symptoms.length ? this.encryption.encrypt(JSON.stringify(symptoms), ENC.symptoms) : null,
      note: this.encryption.encryptNullable(note, ENC.note),
    };
    const row = await this.prisma.dailyLog.upsert({
      where: key,
      create: { patientId, date: stringToDateColumn(date), ...data },
      update: data,
    });
    this.audit(userId, access, 'womens-health.log.save', row.id, { date });
    return this.logResponse(row);
  }

  // -------------------------------------------------------------------------
  // Pregnancy
  // -------------------------------------------------------------------------

  async startPregnancy(
    userId: string,
    access: ProfileAccess,
    input: StartPregnancyRequest,
  ): Promise<PregnancyResponse> {
    ensureAvailable(access);
    const today = dhakaDate();
    const elapsed = daysBetween(input.lmpDate, today);
    if (elapsed < 0 || elapsed > MAX_PREGNANCY_DAYS) {
      throw new AppException(
        WomensHealthErrorCode.PREGNANCY_LMP_INVALID,
        'The last period must be within the last 42 weeks',
      );
    }
    const { dueDate } = pregnancyProgress(input.lmpDate, today);
    const row = await this.prisma.pregnancyTracking
      .create({
        data: {
          patientId: access.profile.id,
          lmpDate: this.encryption.encrypt(input.lmpDate, ENC.lmpDate),
          dueDate: this.encryption.encrypt(dueDate, ENC.dueDate),
        },
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new AppException(
            WomensHealthErrorCode.PREGNANCY_ALREADY_ACTIVE,
            'A pregnancy is already being tracked',
            HttpStatus.CONFLICT,
          );
        }
        throw error;
      });
    this.audit(userId, access, 'womens-health.pregnancy.start', row.id);
    return this.pregnancyResponse(row, today);
  }

  /** Stops tracking (birth, loss or a mistake); the row stays for history. */
  async endPregnancy(userId: string, access: ProfileAccess): Promise<void> {
    ensureAvailable(access);
    const { count } = await this.prisma.pregnancyTracking.updateMany({
      where: { patientId: access.profile.id, status: 'ACTIVE' },
      data: { status: 'ENDED' },
    });
    if (count === 0) {
      throw new AppException(
        WomensHealthErrorCode.PREGNANCY_NOT_FOUND,
        'No pregnancy is being tracked',
        HttpStatus.NOT_FOUND,
      );
    }
    this.audit(userId, access, 'womens-health.pregnancy.end', access.profile.id);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Latest first. */
  private recentPeriods(patientId: string): Promise<PeriodCycle[]> {
    return this.prisma.periodCycle.findMany({
      where: { patientId },
      orderBy: { startDate: 'desc' },
      take: PERIOD_HISTORY_LIMIT,
    });
  }

  /** Decrypted dates, ascending (what the prediction functions expect). */
  private periodDates(rowsLatestFirst: readonly PeriodCycle[]): PeriodDates[] {
    return rowsLatestFirst
      .map((row) => ({
        startDate: dateColumnToString(row.startDate),
        endDate: this.encryption.decryptNullable(row.endDate, ENC.endDate),
      }))
      .reverse();
  }

  /** Responses latest first, each with the length of its cycle. */
  private periodResponses(rowsLatestFirst: readonly PeriodCycle[], ascending: readonly PeriodDates[]): PeriodResponse[] {
    const lengths = cycleLengths(ascending);
    const n = ascending.length;
    return rowsLatestFirst.map((row, i) => {
      const dates = ascending[n - 1 - i];
      return {
        id: row.id,
        startDate: dates.startDate,
        endDate: dates.endDate,
        cycleLengthDays: lengths[n - 1 - i],
        periodDays: periodLength(dates),
      };
    });
  }

  private async findPeriodResponse(patientId: string, periodId: string): Promise<PeriodResponse> {
    const rows = await this.recentPeriods(patientId);
    const response = this.periodResponses(rows, this.periodDates(rows)).find((p) => p.id === periodId);
    if (response) return response;
    // Older than the history window: no cycle length to show.
    const row = await this.findPeriod(patientId, periodId);
    const dates = {
      startDate: dateColumnToString(row.startDate),
      endDate: this.encryption.decryptNullable(row.endDate, ENC.endDate),
    };
    return { id: row.id, ...dates, cycleLengthDays: null, periodDays: periodLength(dates) };
  }

  private async findPeriod(patientId: string, periodId: string): Promise<PeriodCycle> {
    const row = await this.prisma.periodCycle.findFirst({ where: { id: periodId, patientId } });
    if (!row) throw periodNotFound();
    return row;
  }

  private validatePeriodDates(startDate: string, endDate: string | null): void {
    const today = dhakaDate();
    if (startDate > today || (endDate !== null && endDate > today)) throw dateInFuture();
    if (endDate !== null && endDate < startDate) {
      throw new AppException('VALIDATION_FAILED', 'End date must not be before the start');
    }
    if (endDate !== null && daysBetween(startDate, endDate) + 1 > MAX_PERIOD_DAYS) {
      throw new AppException(
        WomensHealthErrorCode.PERIOD_TOO_LONG,
        `A period cannot be longer than ${MAX_PERIOD_DAYS} days`,
      );
    }
  }

  private async ensureNotTooClose(patientId: string, startDate: string, exceptId?: string): Promise<void> {
    const near = await this.prisma.periodCycle.findFirst({
      where: {
        patientId,
        ...(exceptId ? { id: { not: exceptId } } : {}),
        startDate: {
          gt: stringToDateColumn(addDays(startDate, -MIN_DAYS_BETWEEN_PERIODS)),
          lt: stringToDateColumn(addDays(startDate, MIN_DAYS_BETWEEN_PERIODS)),
        },
      },
      select: { id: true },
    });
    if (near) throw periodTooClose();
  }

  private settingsResponse(row: CycleSettings | null): CycleSettingsResponse {
    if (!row) {
      return { ...DEFAULT_SETTINGS, goal: 'TRACK', appLockEnabled: false, remindersOn: true };
    }
    const goal = cycleGoalSchema.safeParse(this.encryption.decryptNullable(row.goal, ENC.goal));
    return {
      avgCycleDays: row.avgCycleDays,
      avgPeriodDays: row.avgPeriodDays,
      goal: goal.success ? goal.data : 'TRACK',
      appLockEnabled: row.appLockEnabled,
      remindersOn: row.remindersOn,
    };
  }

  private logResponse(row: DailyLog): DailyLogResponse {
    const flow = flowSchema.safeParse(this.encryption.decryptNullable(row.flow, ENC.flow));
    const mood = moodSchema.safeParse(this.encryption.decryptNullable(row.mood, ENC.mood));
    const symptomsJson = this.encryption.decryptNullable(row.symptoms, ENC.symptoms);
    const symptoms = symptomsJson
      ? symptomSchema.array().catch([]).parse(JSON.parse(symptomsJson) as unknown)
      : [];
    return {
      date: dateColumnToString(row.date),
      flow: flow.success ? flow.data : null,
      mood: mood.success ? mood.data : null,
      symptoms,
      note: this.encryption.decryptNullable(row.note, ENC.note),
    };
  }

  private pregnancyResponse(row: PregnancyTracking, today: string): PregnancyResponse {
    const lmpDate = this.encryption.decrypt(row.lmpDate, ENC.lmpDate);
    const progress = pregnancyProgress(lmpDate, today);
    return {
      id: row.id,
      lmpDate,
      ...progress,
      dueDate: this.encryption.decrypt(row.dueDate, ENC.dueDate),
      status: row.status,
    };
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
      entityType: 'WomensHealth',
      entityId,
      ...(meta ? { meta } : {}),
    });
  }
}

function ensureAvailable(access: ProfileAccess): void {
  if (access.profile.gender === 'MALE') {
    throw new AppException(
      WomensHealthErrorCode.WOMENS_HEALTH_NOT_AVAILABLE,
      "Women's health is not available for this profile",
      HttpStatus.FORBIDDEN,
    );
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function periodNotFound(): AppException {
  return new AppException(WomensHealthErrorCode.PERIOD_NOT_FOUND, 'Period not found', HttpStatus.NOT_FOUND);
}

function periodTooClose(): AppException {
  return new AppException(
    WomensHealthErrorCode.PERIOD_TOO_CLOSE,
    'Another period starts within 10 days of this one',
    HttpStatus.CONFLICT,
  );
}

function dateInFuture(): AppException {
  return new AppException(WomensHealthErrorCode.DATE_IN_FUTURE, 'Dates in the future cannot be logged');
}
