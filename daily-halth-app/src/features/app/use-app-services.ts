import { useQueries, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { medicineEndpoints } from '@/api/medicine-endpoints';
import { queryKeys } from '@/api/query-keys';
import {
  doseInstantFor,
  ringsOnThisPhone,
  scheduleSnoozedAlarm,
  syncDoseAlarms,
  type DoseAlarmData,
} from '@/features/medicine/dose-alarm-scheduler';
import { flushDoseQueue, recordDoseOrQueue } from '@/features/medicine/offline-dose-queue';
import {
  DOSE_ACTION_SNOOZE,
  DOSE_ACTION_TAKEN,
  SNOOZE_MINUTES,
  prepareNotifications,
} from '@/features/notifications/notification-setup';
import { registerPushToken } from '@/features/notifications/push-registration';
import { useNotificationPreferences } from '@/features/notifications/use-notifications';
import { useLoadActiveProfile, useProfiles } from '@/features/profiles/use-profiles';
import { showToast } from '@/lib/user-feedback';
import { useActiveProfileStore } from '@/stores/active-profile-store';
import { useSessionStore } from '@/stores/session-store';

/** Keeps the phone's local dose alarms in step with the plans (and the alarm setting). */
function useDoseAlarmSync(registered: boolean) {
  const profiles = useProfiles();
  const preferences = useNotificationPreferences();
  const ringing = (profiles.data ?? []).filter(ringsOnThisPhone);
  const plans = useQueries({
    queries: ringing.map((profile) => ({
      queryKey: queryKeys.plans(profile.id),
      queryFn: async () => (await medicineEndpoints.plans(profile.id, true)).data,
      enabled: registered,
    })),
  });

  const ready = registered && profiles.isSuccess && plans.every((q) => q.isSuccess);
  const signature = plans.map((q) => q.dataUpdatedAt).join(',');
  const alarmEnabled = preferences.data?.alarmEnabled ?? true;

  useEffect(() => {
    if (!ready) return;
    const entries = ringing.map((profile, index) => ({ profile, plans: plans[index]?.data ?? [] }));
    void syncDoseAlarms(entries, alarmEnabled).catch(() => undefined);
    // `signature` captures every plan list change; the arrays themselves change identity each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, signature, alarmEnabled, profiles.dataUpdatedAt]);
}

/** Taps on alarms and pushes: the alarm's buttons, or opening the right screen. */
function useNotificationResponses() {
  const queryClient = useQueryClient();
  const setActiveProfile = useActiveProfileStore((s) => s.setActiveProfile);
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef(new Set<string>());

  useEffect(() => {
    if (!response) return;
    const id = `${response.notification.request.identifier}:${response.actionIdentifier}`;
    if (handled.current.has(id)) return;
    handled.current.add(id);
    void Notifications.clearLastNotificationResponseAsync();

    const { content } = response.notification.request;
    const data = (content.data ?? {}) as Partial<DoseAlarmData> & {
      screen?: string;
      profileId?: string;
    };

    if (data.kind === 'dose' && data.profileId && data.planId && data.time) {
      const alarm = data as DoseAlarmData;
      const scheduledFor = doseInstantFor(alarm, new Date(response.notification.date));
      const refresh = () =>
        queryClient.invalidateQueries({ queryKey: ['profile', alarm.profileId] });

      if (response.actionIdentifier === DOSE_ACTION_TAKEN) {
        void Notifications.dismissNotificationAsync(response.notification.request.identifier);
        void recordDoseOrQueue(alarm.profileId, {
          planId: alarm.planId,
          scheduledFor,
          status: 'TAKEN',
        })
          .then(({ queued }) => {
            showToast(
              queued ? 'সেবন করা হিসেবে রাখা হলো। নেট এলে পাঠানো হবে।' : 'সেবন করা হিসেবে রাখা হলো'
            );
            return refresh();
          })
          .catch(() => showToast('রাখা গেল না। অ্যাপ খুলে আবার চেষ্টা করুন।'));
        return;
      }
      if (response.actionIdentifier === DOSE_ACTION_SNOOZE) {
        void Notifications.dismissNotificationAsync(response.notification.request.identifier);
        void scheduleSnoozedAlarm(content, scheduledFor);
        void recordDoseOrQueue(alarm.profileId, {
          planId: alarm.planId,
          scheduledFor,
          status: 'SNOOZED',
          snoozeMinutes: SNOOZE_MINUTES,
        })
          .then(refresh)
          .catch(() => undefined);
        showToast('১০ মিনিট পরে আবার মনে করাবে');
        return;
      }
      setActiveProfile(alarm.profileId);
      router.push('/medicine');
      return;
    }

    // Server pushes carry a deep link.
    if (data.profileId) setActiveProfile(data.profileId);
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    router.push(data.screen === 'medicine' ? '/medicine' : '/notifications');
  }, [response, queryClient, setActiveProfile]);
}

/**
 * Background work of a signed-in session: notification channels, the offline
 * dose queue, the push token, local alarms and alarm/push taps.
 */
export function useAppServices(): void {
  useLoadActiveProfile();
  const queryClient = useQueryClient();
  const registered = useSessionStore((s) => s.status === 'signedIn' && !s.user?.isGuest);

  useEffect(() => {
    void prepareNotifications().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!registered) return;
    const run = async () => {
      const sent = await flushDoseQueue().catch(() => 0);
      if (sent > 0) await queryClient.invalidateQueries({ queryKey: ['profile'] });
      await registerPushToken();
    };
    void run();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void run();
    });
    return () => subscription.remove();
  }, [registered, queryClient]);

  useDoseAlarmSync(registered);
  useNotificationResponses();
}
