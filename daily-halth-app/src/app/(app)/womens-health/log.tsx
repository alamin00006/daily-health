import { router, useLocalSearchParams } from 'expo-router';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { apiErrorMessage } from '@/api/api-error-messages';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { LabeledTextInput } from '@/components/ui/labeled-text-input';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { ErrorState, SkeletonBlock } from '@/components/ui/state-views';
import { SurfaceCard } from '@/components/ui/surface-card';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { useCycleLogs, useWomensHealthActions } from '@/features/womens-health/use-womens-health';
import { FLOW_LABELS, MOOD_LABELS, SYMPTOM_LABELS } from '@/features/womens-health/womens-health-display';
import { BANGLA_WEEKDAYS, addDays, dhakaDate, formatDate, weekdayOf } from '@/lib/bangla-format';
import { showToast } from '@/lib/user-feedback';
import {
  flowSchema,
  moodSchema,
  symptomSchema,
  type DailyLogResponse,
  type Flow,
  type Mood,
  type Symptom,
} from '@/shared-contracts/womens-health.contract';
import { colors } from '@/theme/design-tokens';

/** A chip that toggles; tapping a selected one clears it. */
function ToggleChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      className={`min-h-touch flex-row items-center gap-1.5 rounded-full border-[1.5px] px-4 ${
        selected ? 'border-rose bg-rose' : 'border-line bg-surface-card active:bg-rose-soft/50'
      }`}>
      {selected ? <Check size={15} color={colors.white} strokeWidth={2.5} /> : null}
      <BanglaText variant="label" className={selected ? 'font-bangla-semibold text-white' : 'text-ink'}>
        {label}
      </BanglaText>
    </Pressable>
  );
}

function LogForm({ profileId, date, initial }: { profileId: string; date: string; initial: DailyLogResponse | null }) {
  const actions = useWomensHealthActions(profileId);
  const [flow, setFlow] = useState<Flow | null>(initial?.flow ?? null);
  const [mood, setMood] = useState<Mood | null>(initial?.mood ?? null);
  const [symptoms, setSymptoms] = useState<Symptom[]>(initial?.symptoms ?? []);
  const [note, setNote] = useState(initial?.note ?? '');

  const save = () =>
    actions.saveLog.mutate(
      { date, body: { flow, mood, symptoms, note: note.trim() || null } },
      {
        onSuccess: (saved) => {
          showToast(saved ? 'সেভ হয়েছে' : 'এই দিনের লেখা মুছে ফেলা হলো');
          router.back();
        },
        onError: (e) => showToast(apiErrorMessage(e)),
      }
    );

  return (
    <View className="gap-4">
      <SurfaceCard className="gap-3">
        <BanglaText variant="body-strong">রক্তপাত</BanglaText>
        <View className="flex-row flex-wrap gap-2">
          {flowSchema.options.map((f) => (
            <ToggleChip key={f} label={FLOW_LABELS[f]} selected={flow === f} onPress={() => setFlow(flow === f ? null : f)} />
          ))}
        </View>
      </SurfaceCard>
      <SurfaceCard className="gap-3">
        <BanglaText variant="body-strong">মেজাজ</BanglaText>
        <View className="flex-row flex-wrap gap-2">
          {moodSchema.options.map((m) => (
            <ToggleChip key={m} label={MOOD_LABELS[m]} selected={mood === m} onPress={() => setMood(mood === m ? null : m)} />
          ))}
        </View>
      </SurfaceCard>
      <SurfaceCard className="gap-3">
        <BanglaText variant="body-strong">লক্ষণ</BanglaText>
        <View className="flex-row flex-wrap gap-2">
          {symptomSchema.options.map((s) => {
            const on = symptoms.includes(s);
            return (
              <ToggleChip
                key={s}
                label={SYMPTOM_LABELS[s]}
                selected={on}
                onPress={() => setSymptoms(on ? symptoms.filter((x) => x !== s) : [...symptoms, s])}
              />
            );
          })}
        </View>
      </SurfaceCard>
      <LabeledTextInput
        label="নোট (ইচ্ছা হলে)"
        placeholder="যেমন: ব্যথার ওষুধ খেয়েছি"
        value={note}
        onChangeText={setNote}
        maxLength={500}
        multiline
      />
      <ActionButton label="সেভ করুন" loading={actions.saveLog.isPending} onPress={save} />
    </View>
  );
}

/** One day's flow, mood, symptoms and note. Defaults to today; arrows move a day. */
export default function CycleLogScreen() {
  const params = useLocalSearchParams<{ date?: string }>();
  const today = dhakaDate();
  const [date, setDate] = useState(params.date && params.date <= today ? params.date : today);
  const { profile } = useActiveProfile();
  const logs = useCycleLogs(profile?.id, date, date);

  return (
    <ScrollScreen header={<ScreenHeader title="দিনের অবস্থা" fallbackHref="/womens-health" />}>
      <View className="flex-row items-center justify-between rounded-2xl bg-surface-card px-2 py-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="আগের দিন"
          onPress={() => setDate(addDays(date, -1))}
          className="h-11 w-11 items-center justify-center rounded-xl active:bg-rose-soft/50">
          <ChevronLeft size={22} color={colors.ink} />
        </Pressable>
        <View className="items-center">
          <BanglaText variant="body-strong">
            {date === today ? 'আজ' : date === addDays(today, -1) ? 'গতকাল' : BANGLA_WEEKDAYS[weekdayOf(date)]}
          </BanglaText>
          <BanglaText variant="caption">{formatDate(date)}</BanglaText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="পরের দিন"
          disabled={date >= today}
          onPress={() => setDate(addDays(date, 1))}
          className={`h-11 w-11 items-center justify-center rounded-xl ${date >= today ? 'opacity-30' : 'active:bg-rose-soft/50'}`}>
          <ChevronRight size={22} color={colors.ink} />
        </Pressable>
      </View>
      {logs.isLoading || !profile ? (
        <SkeletonBlock className="h-96" />
      ) : logs.isError ? (
        <ErrorState error={logs.error} onRetry={() => void logs.refetch()} />
      ) : (
        <LogForm key={date} profileId={profile.id} date={date} initial={logs.data?.[0] ?? null} />
      )}
    </ScrollScreen>
  );
}
