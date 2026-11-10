import { Injectable, type OnModuleInit } from '@nestjs/common';
import { banglaClock } from '../../common/formatting/bangla-clock.js';
import { toBanglaDigits } from '../../common/formatting/bangla-digits.js';
import {
  dateColumnToString,
  dhakaDate,
  dhakaTimeOfDay,
} from '../../common/time/dhaka-time.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type {
  Appointment,
  FollowUpReminder,
  NotificationChannel,
  ScheduledReminder,
} from '../../generated/prisma/client.js';
import type { OutgoingNotification } from '../notifications/notification-delivery.service.js';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service.js';
import { ReminderSchedulerService } from '../notifications/reminder-scheduler.service.js';
import { ProviderDirectoryService } from '../doctors/provider-directory.service.js';
import { PatientProfilesService } from '../users/patient-profiles.service.js';
import { estimatedSerialTime } from './appointment-views.service.js';

const HOUR_MS = 60 * 60_000;
/** Reminders before a visit or follow-up (CLAUDE.md §1, feature 5). */
const FIRST_REMINDER_MS = 24 * HOUR_MS;
const SECOND_REMINDER_MS = 2 * HOUR_MS;
/** Not worth a reminder this close to the time. */
const MIN_LEAD_MS = 5 * 60_000;

const MODE_TEXT: Record<Appointment['mode'], string> = {
  IN_PERSON: 'চেম্বারে',
  VIDEO: 'ভিডিও কলে',
  CHAT: 'চ্যাটে',
  HOME_VISIT: 'বাসায়',
};

/** "আজ রাত ৭:৩০", "আগামীকাল সকাল ১০:০০", "১৫/১১ সন্ধ্যা ৬:০০". */
export function banglaWhen(instant: Date, now = new Date()): string {
  const date = dhakaDate(instant);
  const today = dhakaDate(now);
  const tomorrow = dhakaDate(new Date(now.getTime() + 24 * HOUR_MS));
  const clock = banglaClock(dhakaTimeOfDay(instant));
  if (date === today) return `আজ ${clock}`;
  if (date === tomorrow) return `আগামীকাল ${clock}`;
  const [, month, day] = date.split('-');
  return `${toBanglaDigits(`${Number(day)}/${Number(month)}`)} ${clock}`;
}

/** The next reminder time: 24 h before, else 2 h before, else none. */
export function nextReminderAt(
  at: Date,
  now = new Date(),
  after?: Date,
): Date | null {
  for (const lead of [FIRST_REMINDER_MS, SECOND_REMINDER_MS]) {
    const fireAt = new Date(at.getTime() - lead);
    if (after && fireAt.getTime() <= after.getTime()) continue;
    if (fireAt.getTime() - now.getTime() >= MIN_LEAD_MS) return fireAt;
  }
  return null;
}

/**
 * Notifications about appointments and follow-ups, and their APPOINTMENT and
 * FOLLOW_UP reminders (24 h, then 2 h before). Text never includes the
 * reason for the visit or other health details.
 */
@Injectable()
export class AppointmentRemindersService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: ReminderSchedulerService,
    private readonly delivery: NotificationDeliveryService,
    private readonly directory: ProviderDirectoryService,
    private readonly profiles: PatientProfilesService,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerHandler('APPOINTMENT', (reminder) =>
      this.appointmentReminder(reminder),
    );
    this.scheduler.registerHandler('FOLLOW_UP', (reminder) =>
      this.followUpReminder(reminder),
    );
  }

  /** Confirmed (paid or free): tell the family and the provider, plan reminders. */
  async onConfirmed(appointment: Appointment): Promise<void> {
    const [names, recipients] = await Promise.all([
      this.names(appointment),
      this.patientRecipients(appointment.patientId, appointment.bookedByUserId),
    ]);
    const serial = appointment.serialNo
      ? `, সিরিয়াল ${toBanglaDigits(appointment.serialNo)}`
      : '';
    const when = banglaWhen(
      estimatedSerialTime(appointment) ?? appointment.scheduledAt,
    );
    await this.delivery.deliver([
      ...recipients.map(
        (userId): OutgoingNotification => ({
          userId,
          patientId: appointment.patientId,
          type: 'appointment.confirmed',
          title: 'অ্যাপয়েন্টমেন্ট নিশ্চিত হয়েছে',
          body: `${names.provider}, ${MODE_TEXT[appointment.mode]} ${when}${serial} (${names.patient})`,
          data: appointmentLink(appointment),
          channels: ['PUSH', 'IN_APP'],
        }),
      ),
      {
        userId: names.providerUserId,
        type: 'appointment.booked',
        title: 'নতুন অ্যাপয়েন্টমেন্ট',
        body: `${names.patient}, ${MODE_TEXT[appointment.mode]} ${when}${serial}`,
        data: { appointmentId: appointment.id },
        channels: ['IN_APP'],
      },
    ]);
    await this.scheduleAppointmentReminder(appointment);
  }

  async onCancelledByProvider(
    appointment: Appointment,
    reason: string,
  ): Promise<void> {
    await this.cancelAppointmentReminders([appointment.id]);
    const [names, recipients] = await Promise.all([
      this.names(appointment),
      this.patientRecipients(appointment.patientId, appointment.bookedByUserId),
    ]);
    await this.delivery.deliver(
      recipients.map((userId) => ({
        userId,
        patientId: appointment.patientId,
        type: 'appointment.cancelled',
        title: 'অ্যাপয়েন্টমেন্ট বাতিল হয়েছে',
        body: `${names.provider} ${banglaWhen(appointment.scheduledAt)}-এর অ্যাপয়েন্টমেন্ট বাতিল করেছেন। কারণ: ${reason}`,
        smsText: `${names.provider} আপনার ${banglaWhen(appointment.scheduledAt)}-এর অ্যাপয়েন্টমেন্ট (${appointment.code}) বাতিল করেছেন। - দৈনিক স্বাস্থ্য`,
        data: appointmentLink(appointment),
        channels: ['PUSH', 'SMS', 'IN_APP'],
        urgent: true,
      })),
    );
  }

  async onCancelledByPatient(appointment: Appointment): Promise<void> {
    await this.cancelAppointmentReminders([appointment.id]);
    if (appointment.status !== 'CANCELLED' || !appointment.confirmedAt) return;
    const names = await this.names(appointment);
    await this.delivery.deliver([
      {
        userId: names.providerUserId,
        type: 'appointment.cancelled',
        title: 'একটি অ্যাপয়েন্টমেন্ট বাতিল হয়েছে',
        body: `${names.patient}, ${banglaWhen(appointment.scheduledAt)}`,
        data: { appointmentId: appointment.id },
        channels: ['IN_APP'],
      },
    ]);
  }

  cancelAppointmentReminders(appointmentIds: string[]): Promise<void> {
    return this.scheduler.cancel('APPOINTMENT', appointmentIds);
  }

  async scheduleFollowUpReminder(followUp: FollowUpReminder): Promise<void> {
    const fireAt = nextReminderAt(followUp.dueAt);
    if (!fireAt || followUp.status !== 'UPCOMING') {
      await this.scheduler.cancel('FOLLOW_UP', [followUp.id]);
      return;
    }
    await this.scheduler.schedule({
      kind: 'FOLLOW_UP',
      userId: followUp.createdByUserId,
      patientId: followUp.patientId,
      refId: followUp.id,
      fireAt,
      channels: ['PUSH', 'IN_APP'],
    });
  }

  cancelFollowUpReminders(followUpIds: string[]): Promise<void> {
    return this.scheduler.cancel('FOLLOW_UP', followUpIds);
  }

  private async scheduleAppointmentReminder(
    appointment: Appointment,
    after?: Date,
  ): Promise<void> {
    const fireAt = nextReminderAt(appointment.scheduledAt, new Date(), after);
    if (!fireAt) return;
    await this.scheduler.schedule({
      kind: 'APPOINTMENT',
      userId: appointment.bookedByUserId,
      patientId: appointment.patientId,
      refId: appointment.id,
      fireAt,
      channels: ['PUSH', 'SMS', 'IN_APP'],
    });
  }

  private async appointmentReminder(
    reminder: ScheduledReminder,
  ): Promise<OutgoingNotification[] | null> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: reminder.refId },
    });
    if (!appointment || appointment.status !== 'CONFIRMED') return null;

    const isLast =
      appointment.scheduledAt.getTime() - reminder.fireAt.getTime() <=
      SECOND_REMINDER_MS + MIN_LEAD_MS;
    if (!isLast) await this.scheduleAppointmentReminder(appointment, reminder.fireAt);

    const [names, recipients] = await Promise.all([
      this.names(appointment),
      this.patientRecipients(appointment.patientId, appointment.bookedByUserId),
    ]);
    const when = banglaWhen(
      estimatedSerialTime(appointment) ?? appointment.scheduledAt,
    );
    const serial = appointment.serialNo
      ? `, সিরিয়াল ${toBanglaDigits(appointment.serialNo)}`
      : '';
    const place = appointment.chamberId
      ? (await this.directory.chambersByIds([appointment.chamberId])).get(
          appointment.chamberId,
        )?.hospital.name
      : null;
    // SMS only for the last reminder: the first is a heads-up.
    const channels: NotificationChannel[] = isLast
      ? ['PUSH', 'SMS', 'IN_APP']
      : ['PUSH', 'IN_APP'];
    return recipients.map((userId) => ({
      userId,
      patientId: appointment.patientId,
      type: 'appointment.reminder',
      title: `${names.patient}-এর অ্যাপয়েন্টমেন্ট ${when}`,
      body: `${names.provider}, ${MODE_TEXT[appointment.mode]}${place ? ` (${place})` : ''}${serial}`,
      smsText: `মনে করিয়ে দিচ্ছি: ${names.provider}-এর কাছে ${names.patient}-এর অ্যাপয়েন্টমেন্ট ${when}${serial}। কোড ${appointment.code} - দৈনিক স্বাস্থ্য`,
      data: appointmentLink(appointment),
      channels,
    }));
  }

  private async followUpReminder(
    reminder: ScheduledReminder,
  ): Promise<OutgoingNotification[] | null> {
    const followUp = await this.prisma.followUpReminder.findUnique({
      where: { id: reminder.refId },
    });
    if (!followUp || followUp.status !== 'UPCOMING') return null;
    const next = nextReminderAt(followUp.dueAt, new Date(), reminder.fireAt);
    if (next) {
      await this.scheduler.schedule({
        kind: 'FOLLOW_UP',
        userId: followUp.createdByUserId,
        patientId: followUp.patientId,
        refId: followUp.id,
        fireAt: next,
        channels: ['PUSH', 'IN_APP'],
      });
    }
    const profile = (await this.profiles.findManyByIds([followUp.patientId])).get(
      followUp.patientId,
    );
    if (!profile || profile.deletedAt) return null;
    const recipients = await this.patientRecipients(
      followUp.patientId,
      followUp.createdByUserId,
    );
    return recipients.map((userId) => ({
      userId,
      patientId: followUp.patientId,
      type: 'follow_up.reminder',
      title: `${profile.fullName}-এর ফলো-আপ ${banglaWhen(followUp.dueAt)}`,
      body: `${followUp.doctorName}${followUp.location ? `, ${followUp.location}` : ''}`,
      data: {
        screen: 'follow-up',
        profileId: followUp.patientId,
        followUpId: followUp.id,
      },
      channels: ['PUSH', 'IN_APP'],
    }));
  }

  /** The booker, and the patient's own account if they have one. */
  private async patientRecipients(
    patientId: string,
    bookedByUserId: string,
  ): Promise<string[]> {
    const profile = (await this.profiles.findManyByIds([patientId])).get(
      patientId,
    );
    const ids = new Set([bookedByUserId]);
    if (profile?.linkedUserId) ids.add(profile.linkedUserId);
    return [...ids];
  }

  private async names(appointment: Appointment) {
    const [provider, profiles] = await Promise.all([
      this.directory.findById(appointment.providerId),
      this.profiles.findManyByIds([appointment.patientId]),
    ]);
    const title = provider?.type === 'DOCTOR' ? 'ডা. ' : '';
    return {
      provider: `${title}${provider?.displayName ?? ''}`,
      providerUserId: provider?.userId ?? '',
      patient: profiles.get(appointment.patientId)?.fullName ?? '',
    };
  }
}

function appointmentLink(appointment: Appointment): Record<string, string> {
  return {
    screen: 'appointment',
    profileId: appointment.patientId,
    appointmentId: appointment.id,
    date: dateColumnToString(appointment.sessionDate),
  };
}
