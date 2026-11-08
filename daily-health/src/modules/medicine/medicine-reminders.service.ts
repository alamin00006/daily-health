import { Injectable, type OnModuleInit } from '@nestjs/common';
import { toBanglaDigits } from '../../common/formatting/bangla-digits.js';
import { dhakaTimeOfDay } from '../../common/time/dhaka-time.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type {
  PatientProfile,
  ScheduledReminder,
} from '../../generated/prisma/client.js';
import type { OutgoingNotification } from '../notifications/notification-delivery.service.js';
import { NotificationPreferencesService } from '../notifications/notification-preferences.service.js';
import { ReminderSchedulerService } from '../notifications/reminder-scheduler.service.js';
import { PatientProfilesService } from '../users/patient-profiles.service.js';
import { ProfileAccessService } from '../users/profile-access.service.js';
import { banglaClock } from '../../common/formatting/bangla-clock.js';
import { stockDaysLeft, toScheduleTimes } from './dose-schedule.js';

/** At most one refill alert per plan per day while the stock stays low. */
const REFILL_ALERT_INTERVAL_MS = 24 * 60 * 60_000;

export interface DoseLogRef {
  id: string;
  planId: string;
  scheduledFor: Date;
}

/**
 * The medicine module's server reminders (erd.md → "মেডিসিন অ্যালার্ম"):
 * - DOSE_BACKUP: the alarm itself rings on the phone; if the dose is still not
 *   TAKEN or SKIPPED `doseBackupDelayMin` later, the patient gets an SMS and
 *   family members with receivesAlerts get a push.
 * - REFILL: the stock lasts `refillAlertDays` or less.
 */
@Injectable()
export class MedicineRemindersService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: ReminderSchedulerService,
    private readonly preferences: NotificationPreferencesService,
    private readonly profiles: PatientProfilesService,
    private readonly access: ProfileAccessService,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerHandler('DOSE_BACKUP', (reminder) =>
      this.doseBackupNotifications(reminder),
    );
    this.scheduler.registerHandler('REFILL', (reminder) =>
      this.refillNotifications(reminder),
    );
  }

  /**
   * Schedules one backup per dose at scheduledFor + the patient's
   * doseBackupDelayMin (or later, after a snooze). Past fire times are skipped.
   */
  async scheduleDoseBackups(
    logs: DoseLogRef[],
    notBefore?: Date,
  ): Promise<void> {
    if (logs.length === 0) return;
    const plans = await this.prisma.medicationPlan.findMany({
      where: { id: { in: [...new Set(logs.map((log) => log.planId))] } },
      select: { id: true, patientId: true, createdByUserId: true },
    });
    const planById = new Map(plans.map((plan) => [plan.id, plan]));
    const profiles = await this.activeProfiles(plans.map((p) => p.patientId));

    const recipients = new Map<string, string>();
    for (const plan of plans) {
      const profile = profiles.get(plan.patientId);
      if (profile) {
        recipients.set(plan.id, profile.linkedUserId ?? plan.createdByUserId);
      }
    }
    const prefs = await this.preferences.getMany([
      ...new Set(recipients.values()),
    ]);

    const now = Date.now();
    for (const log of logs) {
      const plan = planById.get(log.planId);
      const userId = recipients.get(log.planId);
      if (!plan || !userId) continue;
      const delayMs = prefs.get(userId)!.doseBackupDelayMin * 60_000;
      const base = Math.max(
        log.scheduledFor.getTime(),
        notBefore?.getTime() ?? 0,
      );
      const fireAt = new Date(base + delayMs);
      if (fireAt.getTime() <= now) continue;
      await this.scheduler.schedule({
        kind: 'DOSE_BACKUP',
        userId,
        patientId: plan.patientId,
        refId: log.id,
        fireAt,
        channels: ['PUSH', 'SMS', 'IN_APP'],
      });
    }
  }

  cancelDoseBackups(doseLogIds: string[]): Promise<void> {
    return this.scheduler.cancel('DOSE_BACKUP', doseLogIds);
  }

  cancelForPatient(patientId: string): Promise<void> {
    return this.scheduler.cancelForPatient(patientId);
  }

  /** Sends a refill alert now if the stock is low and none went out today. */
  async checkRefill(planId: string): Promise<void> {
    const plan = await this.prisma.medicationPlan.findUnique({
      where: { id: planId },
      include: { times: true },
    });
    if (!plan || !plan.isActive || plan.stockQty === null) return;
    const daysLeft = stockDaysLeft(
      plan.stockQty.toNumber(),
      toScheduleTimes(plan.times),
    );
    if (daysLeft === null || daysLeft > plan.refillAlertDays) return;
    if (
      await this.scheduler.existsSince(
        'REFILL',
        plan.id,
        new Date(Date.now() - REFILL_ALERT_INTERVAL_MS),
      )
    ) {
      return;
    }
    const profile = await this.profiles.findActiveById(plan.patientId);
    if (!profile) return;
    await this.scheduler.schedule({
      kind: 'REFILL',
      userId: profile.linkedUserId ?? plan.createdByUserId,
      patientId: plan.patientId,
      refId: plan.id,
      fireAt: new Date(),
      channels: ['PUSH', 'IN_APP'],
    });
  }

  private async doseBackupNotifications(
    reminder: ScheduledReminder,
  ): Promise<OutgoingNotification[] | null> {
    const log = await this.prisma.doseLog.findUnique({
      where: { id: reminder.refId },
      include: { plan: true },
    });
    if (!log || !log.plan.isActive) return null;
    // Taken or skipped in the meantime: nothing to say.
    if (log.status !== 'PENDING' && log.status !== 'SNOOZED') return null;

    const profile = await this.profiles.findActiveById(log.plan.patientId);
    if (!profile) return null;

    const when = banglaClock(dhakaTimeOfDay(log.scheduledFor));
    const medicine = log.plan.displayName;
    const data = {
      screen: 'medicine',
      profileId: profile.id,
      doseLogId: log.id,
    };

    return (await this.recipientsOf(profile)).map((userId) => {
      const isPatient = userId === profile.linkedUserId;
      return isPatient
        ? {
            userId,
            patientId: profile.id,
            type: 'dose.missed',
            title: 'ওষুধ নেওয়া বাকি',
            body: `${when}-এর ${medicine} এখনো নেওয়া হয়নি। নিয়ে থাকলে অ্যাপে "সেবন করেছি" চাপুন।`,
            smsText: `দৈনিক স্বাস্থ্য: ${when}-এর ${medicine} এখনো নেওয়া হয়নি।`,
            data,
            channels: ['PUSH', 'SMS', 'IN_APP'],
            urgent: true,
          }
        : {
            userId,
            patientId: profile.id,
            type: 'dose.missed',
            title: `${profile.fullName}-এর ওষুধ নেওয়া বাকি`,
            body: `${when}-এর ${medicine} এখনো নেওয়া হয়নি। একবার খোঁজ নিন।`,
            data,
            channels: ['PUSH', 'IN_APP'],
            urgent: true,
          };
    });
  }

  private async refillNotifications(
    reminder: ScheduledReminder,
  ): Promise<OutgoingNotification[] | null> {
    const plan = await this.prisma.medicationPlan.findUnique({
      where: { id: reminder.refId },
      include: { times: true },
    });
    if (!plan || !plan.isActive || plan.stockQty === null) return null;
    const daysLeft = stockDaysLeft(
      plan.stockQty.toNumber(),
      toScheduleTimes(plan.times),
    );
    if (daysLeft === null || daysLeft > plan.refillAlertDays) return null;

    const profile = await this.profiles.findActiveById(plan.patientId);
    if (!profile) return null;

    const left =
      daysLeft <= 0
        ? 'আজই শেষ হয়ে যাবে'
        : `আর মাত্র ${toBanglaDigits(daysLeft)} দিনের আছে`;
    const data = { screen: 'medicine', profileId: profile.id, planId: plan.id };

    return (await this.recipientsOf(profile)).map((userId) => {
      const isPatient = userId === profile.linkedUserId;
      return {
        userId,
        patientId: profile.id,
        type: 'medicine.refill',
        title: isPatient
          ? 'ওষুধ ফুরিয়ে আসছে'
          : `${profile.fullName}-এর ওষুধ ফুরিয়ে আসছে`,
        body: `${plan.displayName} ${left}। সময়মতো কিনে রাখুন।`,
        data,
        channels: ['PUSH', 'IN_APP'],
      };
    });
  }

  /** The patient's own account (if any) plus family members who get alerts. */
  private async recipientsOf(
    profile: Pick<PatientProfile, 'id' | 'linkedUserId'>,
  ): Promise<string[]> {
    const members = await this.access.alertRecipientUserIds(profile.id);
    return [
      ...new Set([
        ...(profile.linkedUserId ? [profile.linkedUserId] : []),
        ...members,
      ]),
    ];
  }

  private async activeProfiles(
    patientIds: string[],
  ): Promise<Map<string, PatientProfile>> {
    const unique = [...new Set(patientIds)];
    const profiles = await Promise.all(
      unique.map((id) => this.profiles.findActiveById(id)),
    );
    return new Map(
      profiles.flatMap((profile) => (profile ? [[profile.id, profile]] : [])),
    );
  }
}
