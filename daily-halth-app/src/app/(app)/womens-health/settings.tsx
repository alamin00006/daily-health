import { Minus, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { apiErrorMessage } from '@/api/api-error-messages';
import { LockPinSetup } from '@/components/womens-health/lock-pin-setup';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ChipSelect } from '@/components/ui/chip-select';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { SurfaceCard } from '@/components/ui/surface-card';
import { SwitchRow } from '@/components/ui/switch-row';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { cancelPeriodReminder } from '@/features/womens-health/period-reminder';
import { useCycleOverview, useWomensHealthActions } from '@/features/womens-health/use-womens-health';
import { GOAL_LABELS } from '@/features/womens-health/womens-health-display';
import { removeLockPin, setLockPin, useWomensHealthLock } from '@/features/womens-health/womens-health-lock';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { showToast } from '@/lib/user-feedback';
import {
  cycleGoalSchema,
  type CycleSettingsResponse,
  type UpdateCycleSettingsRequest,
} from '@/shared-contracts/womens-health.contract';
import { colors } from '@/theme/design-tokens';

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const button = (Icon: typeof Plus, next: number, a11y: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      disabled={next < min || next > max}
      onPress={() => onChange(next)}
      className={`h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface-card ${
        next < min || next > max ? 'opacity-30' : 'active:bg-rose-soft/50'
      }`}>
      <Icon size={20} color={colors.ink} />
    </Pressable>
  );
  return (
    <View className="flex-row items-center justify-between gap-3">
      <BanglaText variant="body-strong" className="flex-1">
        {label}
      </BanglaText>
      {button(Minus, value - 1, `${label} কমান`)}
      <BanglaText className="w-16 text-center font-bangla-bold text-[18px]">{toBanglaDigits(value)} দিন</BanglaText>
      {button(Plus, value + 1, `${label} বাড়ান`)}
    </View>
  );
}

function SettingsForm({ profileId, settings }: { profileId: string; settings: CycleSettingsResponse }) {
  const actions = useWomensHealthActions(profileId);
  const markUnlocked = useWomensHealthLock((s) => s.markUnlocked);
  const [cycle, setCycle] = useState(settings.avgCycleDays);
  const [period, setPeriod] = useState(settings.avgPeriodDays);
  const [settingPin, setSettingPin] = useState(false);

  const save = (body: UpdateCycleSettingsRequest, message = 'সেভ হয়েছে') =>
    actions.updateSettings.mutateAsync(body).then(
      () => showToast(message),
      (e: unknown) => {
        showToast(apiErrorMessage(e));
        throw e;
      }
    );

  const turnLockOn = async (pin: string) => {
    await setLockPin(profileId, pin);
    try {
      await save({ appLockEnabled: true }, 'লক চালু হয়েছে');
      markUnlocked(profileId);
      setSettingPin(false);
    } catch {
      await removeLockPin(profileId);
    }
  };

  const turnLockOff = async () => {
    try {
      await save({ appLockEnabled: false }, 'লক বন্ধ হয়েছে');
      await removeLockPin(profileId);
    } catch {
      // Message already shown; the lock stays on.
    }
  };

  const averagesChanged = cycle !== settings.avgCycleDays || period !== settings.avgPeriodDays;

  // Setting a PIN takes the whole screen, so the keyboard never hides the boxes.
  if (settingPin && !settings.appLockEnabled) {
    return (
      <SurfaceCard className="gap-3">
        <LockPinSetup title="নতুন ৪ সংখ্যার লক PIN দিন" onDone={(pin) => void turnLockOn(pin)} />
        <ActionButton label="বাতিল" variant="ghost" size="sm" onPress={() => setSettingPin(false)} />
      </SurfaceCard>
    );
  }

  return (
    <View className="gap-4">
      <SurfaceCard className="gap-4">
        <Stepper label="সাধারণ চক্র" value={cycle} min={15} max={60} onChange={setCycle} />
        <Stepper label="পিরিয়ড চলে" value={period} min={1} max={15} onChange={setPeriod} />
        <BanglaText variant="caption">
          পিরিয়ডের তারিখ লেখা থাকলে অ্যাপ নিজেই আপনার গড় হিসাব করে নেয়; এই সংখ্যা তখনই কাজে লাগে যখন লেখা
          কিছু নেই।
        </BanglaText>
        {averagesChanged ? (
          <ActionButton
            label="সেভ করুন"
            size="sm"
            loading={actions.updateSettings.isPending}
            onPress={() => void save({ avgCycleDays: cycle, avgPeriodDays: period }).catch(() => undefined)}
          />
        ) : null}
      </SurfaceCard>

      <SurfaceCard>
        <ChipSelect
          label="আপনার লক্ষ্য"
          options={cycleGoalSchema.options.map((g) => ({ value: g, label: GOAL_LABELS[g] }))}
          value={settings.goal}
          onChange={(goal) => void save({ goal }).catch(() => undefined)}
        />
      </SurfaceCard>

      <SurfaceCard className="gap-1">
        <SwitchRow
          title="পিরিয়ডের আগে মনে করিয়ে দিন"
          subtitle="সম্ভাব্য তারিখের ২ দিন আগে সকাল ৯টায়। নোটিফিকেশনে কোনো বিস্তারিত থাকবে না।"
          value={settings.remindersOn}
          onChange={(on) =>
            void save({ remindersOn: on })
              .then(() => (on ? undefined : cancelPeriodReminder(profileId)))
              .catch(() => undefined)
          }
          divider
        />
        <SwitchRow
          title="PIN দিয়ে লক করুন"
          subtitle="এই অংশ খুলতে আলাদা ৪ সংখ্যার PIN লাগবে। PIN শুধু এই ফোনে থাকে।"
          value={settings.appLockEnabled}
          onChange={(on) => (on ? setSettingPin(true) : void turnLockOff())}
        />
      </SurfaceCard>
    </View>
  );
}

export default function WomensHealthSettingsScreen() {
  const { profile } = useActiveProfile();
  const overview = useCycleOverview(profile?.id);
  if (!profile || !overview.data) return null;
  return (
    <ScrollScreen header={<ScreenHeader title="নারীস্বাস্থ্য সেটিংস" fallbackHref="/womens-health" />}>
      <SettingsForm profileId={profile.id} settings={overview.data.settings} />
    </ScrollScreen>
  );
}
