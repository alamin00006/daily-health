import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import {
  dateColumnToString,
  dhakaDate,
  hhmmToTimeColumn,
  stringToDateColumn,
  timeColumnToHhmm,
} from '../../common/time/dhaka-time.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { Prisma, type Provider } from '../../generated/prisma/client.js';
import { bangladeshPhoneSchema } from '../../shared-contracts/common-fields.contract.js';
import type {
  CreateChamberRequest,
  CreateHospitalRequest,
  CreateScheduleExceptionRequest,
  CreateScheduleRequest,
  HospitalResponse,
  MyProviderProfileResponse,
  ScheduleExceptionResponse,
  UpdateChamberRequest,
  UpdateScheduleRequest,
} from '../../shared-contracts/doctors.contract.js';
import { DoctorsErrorCode } from './doctors-error-codes.js';
import { ProviderDirectoryService } from './provider-directory.service.js';
import { modeFeeMissing, ProviderProfileService } from './provider-profile.service.js';
import { modeFee, toHospitalResponse } from './provider-responses.js';
import { timesOverlap } from './session-calendar.js';

const HOSPITAL_SEARCH_LIMIT = 15;

/**
 * Where and when a provider sees patients: hospitals, chambers, weekly
 * schedules and days off. Turning a schedule or chamber off stops new
 * bookings; bookings already made stay (the provider cancels them from the
 * appointment list if needed), so nothing here reads the appointments module.
 */
@Injectable()
export class ProviderSchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directory: ProviderDirectoryService,
    private readonly profile: ProviderProfileService,
  ) {}

  async searchHospitals(q: string): Promise<HospitalResponse[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "providers"."Hospital"
      WHERE "name" ILIKE ${`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`} OR "name" % ${q}
      ORDER BY similarity("name", ${q}) DESC
      LIMIT ${HOSPITAL_SEARCH_LIMIT}`;
    const hospitals = await this.prisma.hospital.findMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });
    const rank = new Map(rows.map((row, index) => [row.id, index]));
    return hospitals
      .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
      .map(toHospitalResponse);
  }

  /** Providers add a hospital that is not listed; the same name+district returns the existing one. */
  async createHospital(
    userId: string,
    input: CreateHospitalRequest,
  ): Promise<HospitalResponse> {
    await this.directory.requireOwn(userId);
    const phone = input.phone
      ? bangladeshPhoneSchema.safeParse(input.phone)
      : null;
    if (phone && !phone.success) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'Phone must be a Bangladeshi number',
        HttpStatus.BAD_REQUEST,
        {
          issues: [
            { path: 'phone', code: 'invalid', message: 'Bangladeshi number' },
          ],
        },
      );
    }
    const existing = await this.prisma.hospital.findFirst({
      where: {
        name: { equals: input.name, mode: 'insensitive' },
        district: { equals: input.district, mode: 'insensitive' },
      },
    });
    if (existing) return toHospitalResponse(existing);
    const hospital = await this.prisma.hospital.create({
      data: {
        name: input.name,
        address: input.address,
        district: input.district,
        phone: phone?.success ? phone.data : null,
      },
    });
    return toHospitalResponse(hospital);
  }

  async createChamber(
    userId: string,
    input: CreateChamberRequest,
  ): Promise<MyProviderProfileResponse> {
    const provider = await this.directory.requireOwn(userId);
    const hospital = await this.prisma.hospital.findUnique({
      where: { id: input.hospitalId },
      select: { id: true },
    });
    if (!hospital) {
      throw new AppException(
        DoctorsErrorCode.HOSPITAL_NOT_FOUND,
        'Hospital not found',
        HttpStatus.NOT_FOUND,
      );
    }
    const duplicate = await this.prisma.chamber.findFirst({
      where: {
        providerId: provider.id,
        hospitalId: input.hospitalId,
        isActive: true,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new AppException(
        DoctorsErrorCode.CHAMBER_EXISTS,
        'You already have a chamber at this hospital',
        HttpStatus.CONFLICT,
      );
    }
    await this.prisma.chamber.create({
      data: {
        providerId: provider.id,
        hospitalId: input.hospitalId,
        room: input.room ?? null,
        fee: new Prisma.Decimal(input.fee),
        followUpFee:
          input.followUpFee == null ? null : new Prisma.Decimal(input.followUpFee),
      },
    });
    return this.profile.view(provider.id);
  }

  async updateChamber(
    userId: string,
    chamberId: string,
    input: UpdateChamberRequest,
  ): Promise<MyProviderProfileResponse> {
    const provider = await this.directory.requireOwn(userId);
    await this.requireChamber(provider, chamberId);
    await this.prisma.chamber.update({
      where: { id: chamberId },
      data: {
        ...(input.room !== undefined ? { room: input.room } : {}),
        ...(input.fee !== undefined
          ? { fee: new Prisma.Decimal(input.fee) }
          : {}),
        ...(input.followUpFee !== undefined
          ? {
              followUpFee:
                input.followUpFee === null
                  ? null
                  : new Prisma.Decimal(input.followUpFee),
            }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    return this.profile.view(provider.id);
  }

  /** One schedule row per selected weekday. */
  async createSchedules(
    userId: string,
    input: CreateScheduleRequest,
  ): Promise<MyProviderProfileResponse> {
    const provider = await this.directory.requireOwn(userId);
    if (input.mode === 'IN_PERSON') {
      const chamber = await this.requireChamber(provider, input.chamberId!);
      if (!chamber.isActive) {
        throw new AppException(
          DoctorsErrorCode.CHAMBER_NOT_FOUND,
          'Turn the chamber on first',
          HttpStatus.CONFLICT,
        );
      }
    } else {
      const fee = modeFee(provider, input.mode);
      if (fee === null || (input.mode === 'HOME_VISIT' && !provider.offersHomeVisit)) {
        throw modeFeeMissing(input.mode);
      }
    }
    for (const day of input.days) {
      await this.assertNoOverlap(
        provider.id,
        day,
        input.startTime,
        input.endTime,
      );
    }
    await this.prisma.schedule.createMany({
      data: input.days.map((dayOfWeek) => ({
        providerId: provider.id,
        chamberId: input.mode === 'IN_PERSON' ? input.chamberId! : null,
        mode: input.mode,
        dayOfWeek,
        startTime: hhmmToTimeColumn(input.startTime),
        endTime: hhmmToTimeColumn(input.endTime),
        slotMinutes: input.mode === 'IN_PERSON' ? null : input.slotMinutes!,
        maxPatients: input.mode === 'IN_PERSON' ? input.maxPatients! : null,
      })),
    });
    return this.profile.view(provider.id);
  }

  async updateSchedule(
    userId: string,
    scheduleId: string,
    input: UpdateScheduleRequest,
  ): Promise<MyProviderProfileResponse> {
    const provider = await this.directory.requireOwn(userId);
    const schedule = await this.requireSchedule(provider, scheduleId);
    const startTime = input.startTime ?? timeColumnToHhmm(schedule.startTime);
    const endTime = input.endTime ?? timeColumnToHhmm(schedule.endTime);
    if (endTime <= startTime) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'Must end after it starts',
        HttpStatus.BAD_REQUEST,
        { issues: [{ path: 'endTime', code: 'custom', message: 'Must end after it starts' }] },
      );
    }
    const isActive = input.isActive ?? schedule.isActive;
    if (isActive) {
      await this.assertNoOverlap(
        provider.id,
        schedule.dayOfWeek,
        startTime,
        endTime,
        schedule.id,
      );
      if (schedule.mode !== 'IN_PERSON' && modeFee(provider, schedule.mode) === null) {
        throw modeFeeMissing(schedule.mode);
      }
    }
    const isInPerson = schedule.mode === 'IN_PERSON';
    await this.prisma.schedule.update({
      where: { id: schedule.id },
      data: {
        startTime: hhmmToTimeColumn(startTime),
        endTime: hhmmToTimeColumn(endTime),
        isActive,
        ...(isInPerson && input.maxPatients !== undefined
          ? { maxPatients: input.maxPatients }
          : {}),
        ...(!isInPerson && input.slotMinutes !== undefined
          ? { slotMinutes: input.slotMinutes }
          : {}),
      },
    });
    return this.profile.view(provider.id);
  }

  /**
   * "Delete" turns it off: bookings already made keep pointing at it, and the
   * row is reused if the provider turns it on again.
   */
  async removeSchedule(
    userId: string,
    scheduleId: string,
  ): Promise<MyProviderProfileResponse> {
    const provider = await this.directory.requireOwn(userId);
    await this.requireSchedule(provider, scheduleId);
    await this.prisma.schedule.update({
      where: { id: scheduleId },
      data: { isActive: false },
    });
    return this.profile.view(provider.id);
  }

  async listExceptions(
    userId: string,
    from?: string,
  ): Promise<ScheduleExceptionResponse[]> {
    const provider = await this.directory.requireOwn(userId);
    const rows = await this.prisma.scheduleException.findMany({
      where: {
        providerId: provider.id,
        date: { gte: stringToDateColumn(from ?? dhakaDate()) },
      },
      orderBy: [{ date: 'asc' }],
    });
    return rows.map(toExceptionResponse);
  }

  async createException(
    userId: string,
    input: CreateScheduleExceptionRequest,
  ): Promise<ScheduleExceptionResponse> {
    const provider = await this.directory.requireOwn(userId);
    if (input.date < dhakaDate()) {
      throw new AppException(
        DoctorsErrorCode.SCHEDULE_EXCEPTION_PAST,
        'The date is in the past',
      );
    }
    if (input.scheduleId) await this.requireSchedule(provider, input.scheduleId);
    try {
      const row = await this.prisma.scheduleException.create({
        data: {
          providerId: provider.id,
          scheduleId: input.scheduleId ?? null,
          date: stringToDateColumn(input.date),
          isOff: input.isOff,
          startTime:
            !input.isOff && input.startTime
              ? hhmmToTimeColumn(input.startTime)
              : null,
          endTime:
            !input.isOff && input.endTime ? hhmmToTimeColumn(input.endTime) : null,
          note: input.note ?? null,
        },
      });
      return toExceptionResponse(row);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppException(
          DoctorsErrorCode.SCHEDULE_EXCEPTION_EXISTS,
          'There is already a change for that day',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async removeException(userId: string, exceptionId: string): Promise<void> {
    const provider = await this.directory.requireOwn(userId);
    const deleted = await this.prisma.scheduleException.deleteMany({
      where: { id: exceptionId, providerId: provider.id },
    });
    if (deleted.count === 0) {
      throw new AppException(
        DoctorsErrorCode.SCHEDULE_EXCEPTION_NOT_FOUND,
        'Not found',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  private async requireChamber(provider: Provider, chamberId: string) {
    const chamber = await this.prisma.chamber.findFirst({
      where: { id: chamberId, providerId: provider.id },
    });
    if (!chamber) {
      throw new AppException(
        DoctorsErrorCode.CHAMBER_NOT_FOUND,
        'Chamber not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return chamber;
  }

  private async requireSchedule(provider: Provider, scheduleId: string) {
    const schedule = await this.prisma.schedule.findFirst({
      where: { id: scheduleId, providerId: provider.id },
    });
    if (!schedule) {
      throw new AppException(
        DoctorsErrorCode.SCHEDULE_NOT_FOUND,
        'Schedule not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return schedule;
  }

  /** A provider cannot be in two sessions at once (chamber and video alike). */
  private async assertNoOverlap(
    providerId: string,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
    exceptScheduleId?: string,
  ): Promise<void> {
    const sameDay = await this.prisma.schedule.findMany({
      where: {
        providerId,
        dayOfWeek,
        isActive: true,
        ...(exceptScheduleId ? { id: { not: exceptScheduleId } } : {}),
      },
    });
    const clash = sameDay.find((other) =>
      timesOverlap(
        startTime,
        endTime,
        timeColumnToHhmm(other.startTime),
        timeColumnToHhmm(other.endTime),
      ),
    );
    if (clash) {
      throw new AppException(
        DoctorsErrorCode.SCHEDULE_OVERLAP,
        'Overlaps another session that day',
        HttpStatus.CONFLICT,
        {
          dayOfWeek,
          startTime: timeColumnToHhmm(clash.startTime),
          endTime: timeColumnToHhmm(clash.endTime),
        },
      );
    }
  }
}

function toExceptionResponse(
  row: Prisma.ScheduleExceptionGetPayload<object>,
): ScheduleExceptionResponse {
  return {
    id: row.id,
    date: dateColumnToString(row.date),
    scheduleId: row.scheduleId,
    isOff: row.isOff,
    startTime: row.startTime ? timeColumnToHhmm(row.startTime) : null,
    endTime: row.endTime ? timeColumnToHhmm(row.endTime) : null,
    note: row.note,
  };
}
