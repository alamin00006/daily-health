import Constants from 'expo-constants';
import { router } from 'expo-router';
import { LogOut, Mail, ShieldCheck, UsersRound } from 'lucide-react-native';
import { View } from 'react-native';

import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ChipSelect } from '@/components/ui/chip-select';
import { FormErrorBanner } from '@/components/ui/form-error-banner';
import { ListRow, SectionHeader } from '@/components/ui/list-row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { SkeletonBlock } from '@/components/ui/state-views';
import { SurfaceCard } from '@/components/ui/surface-card';
import { SwitchRow } from '@/components/ui/switch-row';
import { apiErrorMessage } from '@/api/api-error-messages';
import { AlarmReliabilityCard } from '@/components/medicine/alarm-reliability-card';
import { useSignOutMutation } from '@/features/auth/use-auth-mutations';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '@/features/notifications/use-notifications';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { confirmAction, showToast } from '@/lib/user-feedback';
import type { UpdateNotificationPreferencesRequest } from '@/shared-contracts/notifications.contract';
import { useSessionStore } from '@/stores/session-store';

const DELAY_OPTIONS = [15, 30, 60, 120].map((value) => ({
  value,
  label: value < 60 ? `${toBanglaDigits(value)} মিনিট` : `${toBanglaDigits(value / 60)} ঘণ্টা`,
}));

export default function SettingsScreen() {
  const user = useSessionStore((s) => s.user);
  const signOut = useSignOutMutation();
  const preferences = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const prefs = preferences.data;

  const change = (body: UpdateNotificationPreferencesRequest) =>
    update.mutate(body, { onError: (error) => showToast(apiErrorMessage(error)) });

  return (
    <ScrollScreen
      header={<ScreenHeader title="সেটিংস" fallbackHref="/home" />}
      onRefresh={() => preferences.refetch()}>
      <SurfaceCard className="py-1">
        <ListRow icon={Mail} title="ইমেইল" subtitle={user?.email ?? ''} divider />
        <ListRow
          icon={ShieldCheck}
          iconTone="success"
          title="লগইন সুরক্ষা"
          subtitle="৬ সংখ্যার পিন ও ইমেইল যাচাই"
          divider
        />
        <ListRow icon={UsersRound} title="পরিবার ও সদস্য" onPress={() => router.push('/family')} />
      </SurfaceCard>

      <AlarmReliabilityCard />

      <View className="gap-3">
        <SectionHeader title="অ্যালার্ম ও বার্তা" />
        {!prefs ? (
          <SkeletonBlock className="h-56" />
        ) : (
          <>
            <SurfaceCard className="py-1">
              <SwitchRow
                title="ওষুধের অ্যালার্ম"
                subtitle="এই ফোনে প্রতিটি ডোজের সময় অ্যালার্ম বাজবে"
                value={prefs.alarmEnabled}
                onChange={(alarmEnabled) => change({ alarmEnabled })}
                divider
              />
              <SwitchRow
                title="পুশ নোটিফিকেশন"
                subtitle="পরিবারের কারো ওষুধ বাদ পড়লে বা ফুরিয়ে এলে"
                value={prefs.pushEnabled}
                onChange={(pushEnabled) => change({ pushEnabled })}
                divider
              />
              <SwitchRow
                title="এসএমএস"
                subtitle="নিজের ওষুধ বাদ পড়লে এসএমএসে জানানো (মোবাইল নম্বর যোগ হলে চালু হবে)"
                value={prefs.smsEnabled}
                onChange={(smsEnabled) => change({ smsEnabled })}
              />
            </SurfaceCard>

            <SurfaceCard className="gap-3">
              <ChipSelect
                label="ওষুধ না খেলে কতক্ষণ পরে পরিবারকে জানাব?"
                options={DELAY_OPTIONS}
                value={prefs.doseBackupDelayMin}
                onChange={(doseBackupDelayMin) => change({ doseBackupDelayMin })}
              />
            </SurfaceCard>

            <SurfaceCard className="py-1">
              <SwitchRow
                title="রাতে নীরব"
                subtitle="রাত ১০টা থেকে সকাল ৭টা পর্যন্ত বার্তা শব্দ ছাড়া আসবে। ওষুধ বাদ পড়ার সতর্কতা তবুও শব্দ করবে।"
                value={Boolean(prefs.quietStart)}
                onChange={(on) =>
                  change(
                    on
                      ? { quietStart: '22:00', quietEnd: '07:00' }
                      : { quietStart: null, quietEnd: null }
                  )
                }
              />
            </SurfaceCard>
            <FormErrorBanner message={update.error ? apiErrorMessage(update.error) : null} />
          </>
        )}
      </View>

      <ActionButton
        label="লগআউট"
        icon={LogOut}
        variant="danger"
        loading={signOut.isPending}
        onPress={async () => {
          const ok = await confirmAction({
            title: 'লগআউট করবেন?',
            message: 'এই ফোনে ওষুধের অ্যালার্মও বন্ধ হয়ে যাবে। আবার লগইন করলে চালু হবে।',
            confirmLabel: 'লগআউট',
          });
          if (ok) signOut.mutate();
        }}
      />

      <BanglaText variant="caption" className="text-center text-ink-subtle">
        দৈনিক স্বাস্থ্য · সংস্করণ {toBanglaDigits(Constants.expoConfig?.version ?? '1.0.0')}
      </BanglaText>
    </ScrollScreen>
  );
}
