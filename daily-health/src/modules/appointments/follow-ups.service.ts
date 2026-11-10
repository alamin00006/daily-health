import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception.js';
import {
  decodeCursor,
  encodeCursor,
  afterCursor,
  toKeysetPage,
} from '../../common/pagination/keyset-cursor.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  CreateFollowUpRequest,
  FollowUpResponse,
  ListFollowUpsQuery,
  UpdateFollowUpRequest,
} from '../../shared-contracts/appointments.contract.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import type { ProfileAccess } from '../users/profile-access.service.js';
import { AppointmentRemindersService } from './appointment-reminders.service.js';
import { toFollowUpResponse } from './appointment-views.service.js';
import { AppointmentsErrorCode } from './appointments-error-codes.js';

/** An UPCOMING follow-up this long overdue counts as MISSED in lists. */
const MISSED_AFTER_MS = 24 * 60 * 60_000;

/**
 * Follow-ups: "come back in 14 days" from a doctor in the app, or one the
 * family adds for a doctor outside the app. Reminded 24 h and 2 h before.
 */
@Injectable()
export class FollowUpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reminders: AppointmentRemindersService,
  ) {}

  async list(
    access: ProfileAccess,
    query: ListFollowUpsQuery,
  ): Promise<PaginatedResponse<FollowUpResponse>> {
    const patientId = access.profile.id;
    await this.markOverdueMissed(patientId);
    if (query.scope === 'past') {
      const rows = await this.prisma.followUpReminder.findMany({
        where: {
          patientId,
          status: { not: 'UPCOMING' },
          ...afterCursor('dueAt', query.cursor),
        },
        orderBy: [{ dueAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
      });
      return toKeysetPage(rows, query.limit, (r) => r.dueAt, toFollowUpResponse);
    }
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await this.prisma.followUpReminder.findMany({
      where: {
        patientId,
        status: 'UPCOMING',
        ...(after
          ? {
              OR: [
                { dueAt: { gt: after.at } },
                { dueAt: after.at, id: { gt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    return {
      data: page.map(toFollowUpResponse),
      meta: {
        cursor:
          hasMore && last ? encodeCursor({ at: last.dueAt, id: last.id }) : null,
        hasMore,
      },
    };
  }

  async create(
    userId: string,
    access: ProfileAccess,
    input: CreateFollowUpRequest,
  ): Promise<FollowUpResponse> {
    const row = await this.prisma.followUpReminder.create({
      data: {
        patientId: access.profile.id,
        createdByUserId: userId,
        doctorName: input.doctorName,
        location: input.location ?? null,
        mode: input.mode,
        dueAt: new Date(input.dueAt),
        note: input.note ?? null,
      },
    });
    await this.reminders.scheduleFollowUpReminder(row);
    return toFollowUpResponse(row);
  }

  /** Set by the provider when completing a visit. */
  async createFromVisit(input: {
    patientId: string;
    appointmentId: string;
    providerId: string;
    doctorName: string;
    location: string | null;
    mode: 'IN_PERSON' | 'VIDEO' | 'HOME_VISIT';
    dueAt: Date;
    note: string | null;
    notifyUserId: string;
  }): Promise<void> {
    const row = await this.prisma.followUpReminder.create({
      data: {
        patientId: input.patientId,
        // Reminders go to the family member who booked the visit.
        createdByUserId: input.notifyUserId,
        appointmentId: input.appointmentId,
        providerId: input.providerId,
        doctorName: input.doctorName,
        location: input.location,
        mode: input.mode,
        dueAt: input.dueAt,
        note: input.note,
      },
    });
    await this.reminders.scheduleFollowUpReminder(row);
  }

  async update(
    access: ProfileAccess,
    followUpId: string,
    input: UpdateFollowUpRequest,
  ): Promise<FollowUpResponse> {
    const row = await this.require(access, followUpId);
    const fromDoctor = row.appointmentId !== null;
    const editsDetails = Object.keys(input).some((key) => key !== 'status');
    if (fromDoctor && editsDetails) {
      throw new AppException(
        AppointmentsErrorCode.FOLLOW_UP_LOCKED,
        "A doctor's follow-up can only be marked done or cancelled",
        HttpStatus.CONFLICT,
      );
    }
    const data: Prisma.FollowUpReminderUpdateInput = {
      ...(input.doctorName !== undefined ? { doctorName: input.doctorName } : {}),
      ...(input.location !== undefined ? { location: input.location } : {}),
      ...(input.mode !== undefined ? { mode: input.mode } : {}),
      ...(input.dueAt !== undefined ? { dueAt: new Date(input.dueAt) } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    };
    const updated = await this.prisma.followUpReminder.update({
      where: { id: row.id },
      data,
    });
    await this.reminders.scheduleFollowUpReminder(updated);
    return toFollowUpResponse(updated);
  }

  async remove(access: ProfileAccess, followUpId: string): Promise<void> {
    const row = await this.require(access, followUpId);
    if (row.appointmentId) {
      throw new AppException(
        AppointmentsErrorCode.FOLLOW_UP_LOCKED,
        "A doctor's follow-up can only be marked done or cancelled",
        HttpStatus.CONFLICT,
      );
    }
    await this.reminders.cancelFollowUpReminders([row.id]);
    await this.prisma.followUpReminder.delete({ where: { id: row.id } });
  }

  private async require(access: ProfileAccess, followUpId: string) {
    const row = await this.prisma.followUpReminder.findFirst({
      where: { id: followUpId, patientId: access.profile.id },
    });
    if (!row) {
      throw new AppException(
        AppointmentsErrorCode.FOLLOW_UP_NOT_FOUND,
        'Follow-up not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return row;
  }

  private async markOverdueMissed(patientId: string): Promise<void> {
    await this.prisma.followUpReminder.updateMany({
      where: {
        patientId,
        status: 'UPCOMING',
        dueAt: { lt: new Date(Date.now() - MISSED_AFTER_MS) },
      },
      data: { status: 'MISSED' },
    });
  }
}
