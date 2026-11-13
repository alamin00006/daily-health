import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { emitAuditEvent } from '../../common/events/audit-event.js';
import { AppException } from '../../common/errors/app-exception.js';
import { afterCursor, toKeysetPage } from '../../common/pagination/keyset-cursor.js';
import { dhakaDate } from '../../common/time/dhaka-time.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { ReadableIdService } from '../../core/readable-ids/readable-id.service.js';
import { RealtimeService } from '../../core/realtime/realtime.service.js';
import {
  Prisma,
  type EmergencyRequest,
  type EmergencyType,
  type PatientProfile,
} from '../../generated/prisma/client.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import type {
  AddEmergencyLocationRequest,
  CreateEmergencyRequest,
  EmergencyRealtimeEvent,
  EmergencyRequestResponse,
  HandleEmergencyRequest,
  ListEmergencyRequestsQuery,
  RaiseEmergencyResponse,
  StaffEmergencyRequestResponse,
} from '../../shared-contracts/emergency.contract.js';
import { REALTIME_EVENTS } from '../../shared-contracts/realtime.contract.js';
import { StaffDirectoryService } from '../admin/staff-directory.service.js';
import { UserAccountsService } from '../auth/user-accounts.service.js';
import { MedicalConditionsService } from '../health-profile/medical-conditions.service.js';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service.js';
import { PatientProfilesService } from '../users/patient-profiles.service.js';
import { ProfileAccessService, type ProfileAccess } from '../users/profile-access.service.js';
import { EmergencyContactsService, toResponse as contactResponse } from './emergency-contacts.service.js';
import { EmergencyErrorCode } from './emergency-error-codes.js';

const TYPE_TEXT: Record<EmergencyType, string> = {
  SOS: 'জরুরি সাহায্য',
  AMBULANCE: 'অ্যাম্বুলেন্স',
  DOCTOR_CALL: 'ডাক্তারের ফোন',
};

const LIVE: EmergencyRequest['status'][] = ['OPEN', 'DISPATCHED'];

/**
 * The SOS button. Raising alerts the family (members with receivesAlerts and
 * the patient's own account), SMSes the emergency contacts, and puts the
 * request in the staff queue (realtime + push). Staff mark it dispatched and
 * closed; the family can cancel it. Never logs names, numbers or places.
 */
@Injectable()
export class EmergencyRequestsService {
  private readonly logger = new Logger(EmergencyRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly readableIds: ReadableIdService,
    private readonly contacts: EmergencyContactsService,
    private readonly access: ProfileAccessService,
    private readonly profiles: PatientProfilesService,
    private readonly accounts: UserAccountsService,
    private readonly conditions: MedicalConditionsService,
    private readonly delivery: NotificationDeliveryService,
    private readonly realtime: RealtimeService,
    private readonly staff: StaffDirectoryService,
    private readonly events: EventEmitter2,
  ) {}

  // -------------------------------------------------------------------------
  // Family (app)
  // -------------------------------------------------------------------------

  async raise(userId: string, access: ProfileAccess, input: CreateEmergencyRequest): Promise<RaiseEmergencyResponse> {
    const profile = access.profile;
    const open = await this.findLive(profile.id);
    if (open) return { request: this.toResponse(open, profile), alreadyOpen: true };

    let row: EmergencyRequest;
    try {
      row = await this.prisma.$transaction(async (tx) =>
        tx.emergencyRequest.create({
          data: {
            code: await this.readableIds.nextReference('EMERGENCY', tx),
            patientId: profile.id,
            requestedByUserId: userId,
            type: input.type,
            lat: input.lat ?? null,
            lng: input.lng ?? null,
            address: input.address ?? null,
            note: input.note ?? null,
          },
        }),
      );
    } catch (error) {
      // Two presses at the same moment: the other one won.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.findLive(profile.id);
        if (existing) return { request: this.toResponse(existing, profile), alreadyOpen: true };
      }
      throw error;
    }

    this.audit(userId, profile.id, 'emergency.raise', row.id, { type: row.type });
    row = await this.alertEveryone(userId, row, profile);
    this.publish(row, true);
    return { request: this.toResponse(row, profile), alreadyOpen: false };
  }

  /** The live request, if any. */
  async active(access: ProfileAccess): Promise<EmergencyRequestResponse | null> {
    const row = await this.findLive(access.profile.id);
    return row ? this.toResponse(row, access.profile) : null;
  }

  async history(access: ProfileAccess, cursor: string | undefined, limit: number): Promise<PaginatedResponse<EmergencyRequestResponse>> {
    const rows = await this.prisma.emergencyRequest.findMany({
      where: { patientId: access.profile.id, ...afterCursor('createdAt', cursor) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return toKeysetPage(rows, limit, (r) => r.createdAt, (r) => this.toResponse(r, access.profile));
  }

  /**
   * GPS was slower than the SOS: the position follows. Only while the request
   * is live, and only once (a first fix is never overwritten).
   */
  async addLocation(
    userId: string,
    access: ProfileAccess,
    requestId: string,
    input: AddEmergencyLocationRequest,
  ): Promise<EmergencyRequestResponse> {
    const row = await this.findOwned(access.profile.id, requestId);
    const { count } = await this.prisma.emergencyRequest.updateMany({
      where: { id: row.id, status: { in: LIVE }, lat: null },
      data: { lat: input.lat, lng: input.lng },
    });
    const updated = await this.requireById(row.id);
    if (count > 0) {
      this.audit(userId, access.profile.id, 'emergency.location', row.id);
      this.publish(updated, false);
    }
    return this.toResponse(updated, access.profile);
  }

  async cancel(userId: string, access: ProfileAccess, requestId: string): Promise<EmergencyRequestResponse> {
    const row = await this.findOwned(access.profile.id, requestId);
    const updated = await this.transition(row, LIVE, { status: 'CANCELLED', closedAt: new Date() });
    this.audit(userId, access.profile.id, 'emergency.cancel', row.id);
    this.publish(updated, false);
    await this.notifyFamily(updated, access.profile, userId, 'emergency.cancelled', `${updated.code} বাতিল করা হয়েছে`, 'জরুরি অনুরোধটি পরিবারের একজন বাতিল করেছেন।');
    return this.toResponse(updated, access.profile);
  }

  // -------------------------------------------------------------------------
  // Staff (panel)
  // -------------------------------------------------------------------------

  async staffList(staffUserId: string, query: ListEmergencyRequestsQuery): Promise<PaginatedResponse<StaffEmergencyRequestResponse>> {
    const rows = await this.prisma.emergencyRequest.findMany({
      where: {
        status: query.state === 'active' ? { in: LIVE } : { in: ['CLOSED', 'CANCELLED'] },
        ...afterCursor('createdAt', query.cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = toKeysetPage(rows, query.limit, (r) => r.createdAt, (r) => r);
    return { data: await this.staffViews(staffUserId, page.data), meta: page.meta };
  }

  async staffGet(staffUserId: string, requestId: string): Promise<StaffEmergencyRequestResponse> {
    const row = await this.prisma.emergencyRequest.findUnique({ where: { id: requestId } });
    if (!row) throw requestNotFound();
    return (await this.staffViews(staffUserId, [row]))[0];
  }

  async dispatch(staffUserId: string, requestId: string, input: HandleEmergencyRequest): Promise<StaffEmergencyRequestResponse> {
    const row = await this.requireById(requestId);
    const updated = await this.transition(row, ['OPEN'], {
      status: 'DISPATCHED',
      dispatchedAt: new Date(),
      handledByUserId: staffUserId,
      handlerNote: input.note ?? row.handlerNote,
    });
    await this.afterStaffChange(staffUserId, updated, 'emergency.dispatch', 'emergency.dispatched', 'সাহায্য রওনা হয়েছে');
    return this.staffGet(staffUserId, requestId);
  }

  async close(staffUserId: string, requestId: string, input: HandleEmergencyRequest): Promise<StaffEmergencyRequestResponse> {
    const row = await this.requireById(requestId);
    const updated = await this.transition(row, LIVE, {
      status: 'CLOSED',
      closedAt: new Date(),
      handledByUserId: staffUserId,
      handlerNote: input.note ?? row.handlerNote,
    });
    await this.afterStaffChange(staffUserId, updated, 'emergency.close', 'emergency.closed', 'জরুরি অনুরোধটি শেষ করা হয়েছে');
    return this.staffGet(staffUserId, requestId);
  }

  async countLive(): Promise<number> {
    return this.prisma.emergencyRequest.count({ where: { status: { in: LIVE } } });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async alertEveryone(userId: string, row: EmergencyRequest, profile: PatientProfile): Promise<EmergencyRequest> {
    const [names, recipients, contacts, staff] = await Promise.all([
      this.profiles.ownNamesByUserIds([userId]),
      this.access.alertRecipientUserIds(profile.id),
      this.contacts.listFor(profile.id),
      this.accounts.activeStaffUserIds(),
    ]);
    const requester = names.get(userId) ?? 'পরিবারের একজন';
    const place = placeText(row);
    const family = [...new Set([...recipients, ...(profile.linkedUserId ? [profile.linkedUserId] : [])])].filter(
      (id) => id !== userId,
    );
    const data = { screen: 'emergency', profileId: profile.id, requestId: row.id };

    let contactsNotified = 0;
    let contactsFailed = 0;
    try {
      await this.delivery.deliver([
        ...family.map((recipient) => ({
          userId: recipient,
          patientId: profile.id,
          type: 'emergency.raised',
          title: `জরুরি: ${profile.fullName}`,
          body: `${requester} ${TYPE_TEXT[row.type]} চেয়েছেন (${row.code})।${place ? ` অবস্থান: ${place}` : ''}`,
          data,
          channels: ['PUSH' as const, 'IN_APP' as const, 'SMS' as const],
          urgent: true,
        })),
        ...staff.map((recipient) => ({
          userId: recipient,
          type: 'emergency.staff',
          title: `নতুন জরুরি অনুরোধ ${row.code}`,
          body: `${TYPE_TEXT[row.type]} · প্যানেলের জরুরি তালিকা দেখুন`,
          data: { screen: 'staff-emergency', requestId: row.id },
          channels: ['PUSH' as const, 'IN_APP' as const],
          urgent: true,
        })),
      ]);
      const notify = contacts.filter((c) => c.notifyOnSos);
      if (notify.length) {
        const text = `দৈনিক স্বাস্থ্য জরুরি: ${profile.fullName}-এর ${TYPE_TEXT[row.type]} দরকার (${row.code})।${place ? ` অবস্থান: ${place}` : ''}`;
        const results = await this.delivery.sendSmsToNumbers(notify.map((c) => c.phone), text);
        contactsNotified = results.filter((r) => r.ok).length;
        contactsFailed = results.length - contactsNotified;
      }
    } catch (error) {
      // The request itself is saved and in the staff queue; alerts are best effort.
      this.logger.error(`emergency alerts failed: ${error instanceof Error ? error.message : 'unknown'}`);
    }
    return this.prisma.emergencyRequest.update({
      where: { id: row.id },
      data: { membersAlerted: family.length, contactsNotified, contactsFailed },
    });
  }

  private async afterStaffChange(
    staffUserId: string,
    row: EmergencyRequest,
    action: string,
    notificationType: string,
    title: string,
  ): Promise<void> {
    const profile = (await this.profiles.findManyByIds([row.patientId])).get(row.patientId);
    this.audit(staffUserId, row.patientId, action, row.id);
    this.publish(row, false);
    if (profile) {
      await this.notifyFamily(row, profile, null, notificationType, `${row.code}: ${title}`, row.handlerNote ?? title);
    }
  }

  /** The requester and the alerted family, except `exceptUserId`. */
  private async notifyFamily(
    row: EmergencyRequest,
    profile: PatientProfile,
    exceptUserId: string | null,
    type: string,
    title: string,
    body: string,
  ): Promise<void> {
    const recipients = await this.familyOf(row, profile);
    const targets = recipients.filter((id) => id !== exceptUserId);
    this.realtime.toUsers(recipients, REALTIME_EVENTS.EMERGENCY_UPDATED, this.event(row));
    await this.delivery
      .deliver(
        targets.map((userId) => ({
          userId,
          patientId: profile.id,
          type,
          title,
          body,
          data: { screen: 'emergency', profileId: profile.id, requestId: row.id },
          channels: ['PUSH' as const, 'IN_APP' as const],
        })),
      )
      .catch(() => undefined);
  }

  private async familyOf(row: EmergencyRequest, profile: PatientProfile): Promise<string[]> {
    const recipients = await this.access.alertRecipientUserIds(profile.id);
    return [...new Set([row.requestedByUserId, ...recipients, ...(profile.linkedUserId ? [profile.linkedUserId] : [])])];
  }

  private publish(row: EmergencyRequest, isNew: boolean): void {
    this.realtime.toStaff(isNew ? REALTIME_EVENTS.EMERGENCY_NEW : REALTIME_EVENTS.EMERGENCY_UPDATED, this.event(row));
  }

  private event(row: EmergencyRequest): EmergencyRealtimeEvent {
    return { requestId: row.id, profileId: row.patientId, status: row.status };
  }

  /** Moves the request only if it is still in one of `from` (no lost updates). */
  private async transition(
    row: EmergencyRequest,
    from: EmergencyRequest['status'][],
    data: Prisma.EmergencyRequestUpdateManyMutationInput,
  ): Promise<EmergencyRequest> {
    const { count } = await this.prisma.emergencyRequest.updateMany({
      where: { id: row.id, status: { in: from } },
      data,
    });
    if (count === 0) {
      throw new AppException(
        EmergencyErrorCode.EMERGENCY_STATUS_CONFLICT,
        'The request has already moved on',
        HttpStatus.CONFLICT,
        { status: row.status },
      );
    }
    return this.requireById(row.id);
  }

  private findLive(patientId: string): Promise<EmergencyRequest | null> {
    return this.prisma.emergencyRequest.findFirst({ where: { patientId, status: { in: LIVE } } });
  }

  private async findOwned(patientId: string, requestId: string): Promise<EmergencyRequest> {
    const row = await this.prisma.emergencyRequest.findFirst({ where: { id: requestId, patientId } });
    if (!row) throw requestNotFound();
    return row;
  }

  private async requireById(requestId: string): Promise<EmergencyRequest> {
    const row = await this.prisma.emergencyRequest.findUnique({ where: { id: requestId } });
    if (!row) throw requestNotFound();
    return row;
  }

  private async staffViews(staffUserId: string, rows: EmergencyRequest[]): Promise<StaffEmergencyRequestResponse[]> {
    if (rows.length === 0) return [];
    const userIds = rows.flatMap((r) => [r.requestedByUserId, ...(r.handledByUserId ? [r.handledByUserId] : [])]);
    const [profiles, names, accounts, staffNameById] = await Promise.all([
      this.profiles.findManyByIds(rows.map((r) => r.patientId)),
      this.profiles.ownNamesByUserIds(userIds),
      this.accounts.findManyByIds(userIds),
      this.staff.namesByUserIds(rows.flatMap((r) => (r.handledByUserId ? [r.handledByUserId] : []))),
    ]);
    const today = dhakaDate();
    return Promise.all(
      rows.map(async (row) => {
        const profile = profiles.get(row.patientId)!;
        const [conditionNames, contactRows] = await Promise.all([
          this.conditions.namesByKind(row.patientId),
          this.contacts.listFor(row.patientId),
        ]);
        this.audit(staffUserId, row.patientId, 'emergency.staff.view', row.id);
        return {
          ...this.toResponse(row, profile),
          patientCode: profile.patientCode,
          gender: profile.gender,
          age: profile.dateOfBirth ? ageOn(profile.dateOfBirth.toISOString().slice(0, 10), today) : null,
          bloodGroup: profile.bloodGroup,
          chronicConditions: conditionNames.CHRONIC,
          allergies: conditionNames.ALLERGY,
          requestedBy: {
            name: names.get(row.requestedByUserId) ?? null,
            email: accounts.get(row.requestedByUserId)?.email ?? null,
          },
          contacts: contactRows.map(contactResponse),
          handledByName: row.handledByUserId
            ? (staffNameById.get(row.handledByUserId) ?? names.get(row.handledByUserId) ?? null)
            : null,
        };
      }),
    );
  }

  private toResponse(row: EmergencyRequest, profile: Pick<PatientProfile, 'fullName'>): EmergencyRequestResponse {
    return {
      id: row.id,
      code: row.code,
      profileId: row.patientId,
      patientName: profile.fullName,
      type: row.type,
      status: row.status,
      lat: row.lat ? row.lat.toNumber() : null,
      lng: row.lng ? row.lng.toNumber() : null,
      address: row.address,
      note: row.note,
      handlerNote: row.handlerNote,
      membersAlerted: row.membersAlerted,
      contactsNotified: row.contactsNotified,
      contactsFailed: row.contactsFailed,
      createdAt: row.createdAt.toISOString(),
      dispatchedAt: row.dispatchedAt?.toISOString() ?? null,
      closedAt: row.closedAt?.toISOString() ?? null,
    };
  }

  private audit(actorUserId: string, patientId: string, action: string, entityId: string, meta?: Record<string, string>): void {
    emitAuditEvent(this.events, {
      actorUserId,
      patientId,
      action,
      entityType: 'EmergencyRequest',
      entityId,
      ...(meta ? { meta } : {}),
    });
  }
}

/** A map link when there is a location, else the typed address. */
function placeText(row: EmergencyRequest): string | null {
  if (row.lat && row.lng) return `https://maps.google.com/?q=${row.lat.toFixed(6)},${row.lng.toFixed(6)}`;
  return row.address;
}

function ageOn(dateOfBirth: string, today: string): number {
  const [y, m, d] = dateOfBirth.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

function requestNotFound(): AppException {
  return new AppException(
    EmergencyErrorCode.EMERGENCY_REQUEST_NOT_FOUND,
    'Emergency request not found',
    HttpStatus.NOT_FOUND,
  );
}
