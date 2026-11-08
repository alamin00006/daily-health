import * as Notifications from 'expo-notifications';

import { addDays, dhakaDate } from '@/lib/bangla-format';
import { readJson, writeJson } from '@/lib/local-key-value-store';
import { canScheduleExactAlarms } from '@modules/exact-alarm-permission/src';
import type { MedicationPlanResponse } from '@/shared-contracts/medicine.contract';
import type { PatientProfileResponse } from '@/shared-contracts/profiles.contract';
import {
  DOSE_ALARM_CHANNEL,
  DOSE_CATEGORY,
  SNOOZE_MINUTES,
} from '@/features/notifications/notification-setup';

import { doseText, mealTimingText } from './medicine-display';

const FINGERPRINT_KEY = 'dose-alarm-fingerprint';
const DHAKA_OFFSET_MIN = 6 * 60;
/** One-off alarms for courses with an end date are planned this far ahead. */
const DATED_DAYS_AHEAD = 30;
/** Android keeps at most ~500 pending alarms per app; stay well below. */
const MAX_ALARMS = 400;

export interface DoseAlarmData extends Record<string, unknown> {
  kind: 'dose';
  profileId: string;
  planId: string;
  /** "08:00" Asia/Dhaka: the dose this alarm is for. */
  time: string;
  /** Set on snoozed repeats: the original dose instant (ISO). */
  scheduledFor?: string;
}

export interface AlarmProfile {
  profile: PatientProfileResponse;
  plans: MedicationPlanResponse[];
}

/**
 * Whose medicines ring on this phone: the user's own profile, and family
 * members without their own account that the user looks after (a child, a
 * parent without a phone). A parent with their own phone gets the alarm there.
 */
export function ringsOnThisPhone(profile: PatientProfileResponse): boolean {
  if (profile.myRelation === 'SELF') return true;
  return !profile.hasLinkedAccount && profile.myRole !== 'VIEWER';
}

/** Dhaka wall-clock time → the phone's local hour/minute and weekday shift. */
function toDeviceClock(time: string): { hour: number; minute: number; dayShift: number } {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const deviceOffsetMin = -new Date().getTimezoneOffset();
  let total = h * 60 + m + (deviceOffsetMin - DHAKA_OFFSET_MIN);
  let dayShift = 0;
  while (total < 0) {
    total += 1440;
    dayShift -= 1;
  }
  while (total >= 1440) {
    total -= 1440;
    dayShift += 1;
  }
  return { hour: Math.floor(total / 60), minute: total % 60, dayShift };
}

function dhakaInstant(date: string, time: string): Date {
  return new Date(Date.parse(`${date}T${time}:00.000Z`) - DHAKA_OFFSET_MIN * 60_000);
}

interface PlannedAlarm {
  content: Notifications.NotificationContentInput;
  trigger: Notifications.NotificationTriggerInput;
}

function contentFor(
  profile: PatientProfileResponse,
  plan: MedicationPlanResponse,
  time: string,
  dose: number
) {
  const self = profile.myRelation === 'SELF';
  const meal = mealTimingText(plan.mealTiming, plan.mealOffsetMin);
  return {
    title: self ? 'ওষুধ খাওয়ার সময় হয়েছে' : `${profile.fullName}-এর ওষুধের সময়`,
    body: `${plan.displayName}: ${doseText(dose, plan.doseUnit)}${meal ? `, ${meal}` : ''}`,
    categoryIdentifier: DOSE_CATEGORY,
    sound: true,
    priority: Notifications.AndroidNotificationPriority.MAX,
    data: { kind: 'dose', profileId: profile.id, planId: plan.id, time } satisfies DoseAlarmData,
  };
}

function plannedAlarms(entries: AlarmProfile[]): PlannedAlarm[] {
  const today = dhakaDate();
  const now = Date.now();
  const alarms: PlannedAlarm[] = [];

  for (const { profile, plans } of entries) {
    for (const plan of plans) {
      if (!plan.isActive) continue;
      const dated = Boolean(plan.endDate) || plan.startDate > today;
      for (const slot of plan.times) {
        const content = contentFor(profile, plan, slot.time, slot.dose);
        if (!dated) {
          // Ongoing: repeating alarms keep ringing even if the app is not opened for weeks.
          const { hour, minute, dayShift } = toDeviceClock(slot.time);
          if (slot.days.length === 7) {
            alarms.push({
              content,
              trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DAILY,
                hour,
                minute,
                channelId: DOSE_ALARM_CHANNEL,
              },
            });
          } else {
            for (const day of slot.days) {
              alarms.push({
                content,
                trigger: {
                  type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
                  // expo: 1 = Sunday … 7 = Saturday
                  weekday: ((((day + dayShift) % 7) + 7) % 7) + 1,
                  hour,
                  minute,
                  channelId: DOSE_ALARM_CHANNEL,
                },
              });
            }
          }
          continue;
        }
        // A course with an end date (or starting later): one alarm per dose.
        const last =
          plan.endDate && plan.endDate < addDays(today, DATED_DAYS_AHEAD)
            ? plan.endDate
            : addDays(today, DATED_DAYS_AHEAD);
        for (
          let date = plan.startDate > today ? plan.startDate : today;
          date <= last;
          date = addDays(date, 1)
        ) {
          if (!slot.days.includes(new Date(`${date}T00:00:00Z`).getUTCDay())) continue;
          const at = dhakaInstant(date, slot.time);
          if (at.getTime() <= now) continue;
          alarms.push({
            content,
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: at,
              channelId: DOSE_ALARM_CHANNEL,
            },
          });
        }
      }
    }
  }
  return alarms.slice(0, MAX_ALARMS);
}

/**
 * Removes the planned dose alarms. A snoozed repeat stays, unless its plan no
 * longer rings here (stopped, deleted, alarms turned off).
 */
async function cancelDoseAlarms(ringingPlanIds: Set<string>): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((item) => {
        const data = item.content.data as Partial<DoseAlarmData> | null;
        if (data?.kind !== 'dose') return false;
        return !data.scheduledFor || !data.planId || !ringingPlanIds.has(data.planId);
      })
      .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier))
  );
}

/**
 * Makes the phone's scheduled alarms match the plans. Does nothing when
 * nothing changed (fingerprint), so it can run on every data refresh.
 */
export async function syncDoseAlarms(entries: AlarmProfile[], enabled: boolean): Promise<void> {
  const wanted = enabled ? plannedAlarms(entries.filter((e) => ringsOnThisPhone(e.profile))) : [];
  const fingerprint = JSON.stringify({
    // Bump when the alarm content shape changes, so old alarms get replaced.
    v: 2,
    // Alarms set while exact alarms were not allowed stay inexact; redo them once allowed.
    exact: canScheduleExactAlarms(),
    day: wanted.some(
      (a) =>
        (a.trigger as { type?: string }).type === Notifications.SchedulableTriggerInputTypes.DATE
    )
      ? dhakaDate()
      : null,
    tz: new Date().getTimezoneOffset(),
    alarms: wanted.map((a) => [a.content.title, a.content.body, a.trigger]),
  });
  if ((await readJson<string>(FINGERPRINT_KEY)) === fingerprint) return;

  await cancelDoseAlarms(new Set(wanted.map((a) => (a.content.data as DoseAlarmData).planId)));
  for (const alarm of wanted) {
    await Notifications.scheduleNotificationAsync(alarm);
  }
  await writeJson(FINGERPRINT_KEY, fingerprint);
}

/** "১০ মিনিট পরে": rings again once, for the same dose. */
export async function scheduleSnoozedAlarm(
  content: Notifications.NotificationContent,
  scheduledFor: string
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: content.title ?? 'ওষুধ খাওয়ার সময় হয়েছে',
      body: content.body ?? '',
      categoryIdentifier: DOSE_CATEGORY,
      sound: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
      data: { ...(content.data as DoseAlarmData), scheduledFor },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: SNOOZE_MINUTES * 60,
      channelId: DOSE_ALARM_CHANNEL,
    },
  });
}

/** The dose was taken or skipped (in the app or from another alarm): its snoozed repeat must not ring. */
export async function cancelSnoozedAlarm(planId: string, scheduledFor: string): Promise<void> {
  const at = Date.parse(scheduledFor);
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((item) => {
        const data = item.content.data as Partial<DoseAlarmData> | null;
        return (
          data?.kind === 'dose' &&
          data.planId === planId &&
          Boolean(data.scheduledFor) &&
          Date.parse(data.scheduledFor!) === at
        );
      })
      .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier))
  );
}

/** The dose instant an alarm stood for (the repeating ones only know the time). */
export function doseInstantFor(data: DoseAlarmData, firedAt: Date): string {
  if (data.scheduledFor) return data.scheduledFor;
  let date = dhakaDate(firedAt);
  // Fired a little after midnight for a late-night dose of the previous day.
  if (dhakaInstant(date, data.time).getTime() > firedAt.getTime() + 60_000)
    date = addDays(date, -1);
  return dhakaInstant(date, data.time).toISOString();
}
