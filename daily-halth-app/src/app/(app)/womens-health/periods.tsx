import { useLocalSearchParams } from 'expo-router';
import { Droplet, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { apiErrorMessage } from '@/api/api-error-messages';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { DateField } from '@/components/ui/date-time-field';
import { InlineAlert } from '@/components/ui/form-error-banner';
import { IconBadge } from '@/components/ui/icon-badge';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { EmptyState, ErrorState, LoadingList } from '@/components/ui/state-views';
import { SurfaceCard } from '@/components/ui/surface-card';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { usePeriods, useWomensHealthActions } from '@/features/womens-health/use-womens-health';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { addDays, dhakaDate, formatDate } from '@/lib/bangla-format';
import { confirmAction, showToast } from '@/lib/user-feedback';
import type { PeriodResponse } from '@/shared-contracts/womens-health.contract';

const todayAsDate = () => new Date(`${dhakaDate()}T12:00:00`);

/** Add a period, or change / delete one. */
function PeriodForm({
  profileId,
  period,
  onDone,
}: {
  profileId: string;
  period: PeriodResponse | null;
  onDone: () => void;
}) {
  const actions = useWomensHealthActions(profileId);
  const [startDate, setStartDate] = useState<string | null>(period?.startDate ?? null);
  const [endDate, setEndDate] = useState<string | null>(period?.endDate ?? null);
  const [error, setError] = useState<string | null>(null);
  const busy = actions.createPeriod.isPending || actions.updatePeriod.isPending || actions.removePeriod.isPending;

  const save = () => {
    if (!startDate) return setError('কবে শুরু হয়েছিল বেছে নিন।');
    if (endDate && endDate < startDate) return setError('শেষের তারিখ শুরুর আগে হতে পারে না।');
    setError(null);
    const options = {
      onSuccess: () => {
        showToast('সেভ হয়েছে');
        onDone();
      },
      onError: (e: unknown) => setError(apiErrorMessage(e)),
    };
    if (period) actions.updatePeriod.mutate({ periodId: period.id, body: { startDate, endDate } }, options);
    else actions.createPeriod.mutate({ startDate, endDate }, options);
  };

  const remove = async () => {
    if (!period) return;
    const ok = await confirmAction({
      title: 'পিরিয়ডটি মুছবেন?',
      message: `${formatDate(period.startDate)}-এর পিরিয়ড মুছে গেলে হিসাব নতুন করে হবে।`,
      confirmLabel: 'মুছুন',
      destructive: true,
    });
    if (!ok) return;
    actions.removePeriod.mutate(period.id, {
      onSuccess: () => {
        showToast('মুছে ফেলা হয়েছে');
        onDone();
      },
      onError: (e) => setError(apiErrorMessage(e)),
    });
  };

  return (
    <SurfaceCard className="gap-4">
      <BanglaText variant="body-strong">{period ? 'পিরিয়ড ঠিক করুন' : 'পিরিয়ড যোগ করুন'}</BanglaText>
      {error ? <InlineAlert tone="danger" message={error} /> : null}
      <DateField label="শুরু" value={startDate} onChange={setStartDate} maximumDate={todayAsDate()} />
      <DateField
        label="শেষ (চলতে থাকলে খালি রাখুন)"
        value={endDate}
        onChange={setEndDate}
        clearable
        placeholder="এখনো চলছে"
        minimumDate={startDate ? new Date(`${startDate}T12:00:00`) : undefined}
        maximumDate={
          startDate && addDays(startDate, 14) < dhakaDate() ? new Date(`${addDays(startDate, 14)}T12:00:00`) : todayAsDate()
        }
      />
      <ActionButton label="সেভ করুন" loading={busy} onPress={save} />
      {period ? <ActionButton label="মুছে ফেলুন" variant="danger" icon={Trash2} disabled={busy} onPress={() => void remove()} /> : null}
      <ActionButton label="বাতিল" variant="ghost" onPress={onDone} />
    </SurfaceCard>
  );
}

function PeriodRow({ p, onPress }: { p: PeriodResponse; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-3 border-b border-line/60 py-3 active:opacity-70">
      <IconBadge icon={Droplet} tone="rose" size="sm" />
      <View className="flex-1">
        <BanglaText variant="body-strong">
          {formatDate(p.startDate, false)}
          {p.endDate ? ` – ${formatDate(p.endDate, false)}` : ' – চলছে'}
        </BanglaText>
        <BanglaText variant="caption">
          {p.periodDays ? `${toBanglaDigits(p.periodDays)} দিন` : 'শেষ তারিখ দেওয়া নেই'}
          {p.cycleLengthDays ? ` · চক্র ${toBanglaDigits(p.cycleLengthDays)} দিন` : ''}
        </BanglaText>
      </View>
    </Pressable>
  );
}

/** Logged periods, latest first, with each cycle's length. */
export default function PeriodsScreen() {
  const params = useLocalSearchParams<{ add?: string }>();
  const { profile } = useActiveProfile();
  const periods = usePeriods(profile?.id);
  // null = no form; 'new' = adding; otherwise the period being edited.
  const [editing, setEditing] = useState<'new' | PeriodResponse | null>(params.add === '1' ? 'new' : null);

  return (
    <ScrollScreen
      header={<ScreenHeader title="পিরিয়ডের ইতিহাস" fallbackHref="/womens-health" />}
      onRefresh={() => periods.refetch()}>
      {profile && editing ? (
        <PeriodForm
          key={editing === 'new' ? 'new' : editing.id}
          profileId={profile.id}
          period={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      ) : (
        <ActionButton label="আগের পিরিয়ড যোগ করুন" icon={Plus} variant="secondary" onPress={() => setEditing('new')} />
      )}

      {periods.isLoading ? (
        <LoadingList rows={4} rowClassName="h-16" />
      ) : periods.isError ? (
        <ErrorState error={periods.error} onRetry={() => void periods.refetch()} />
      ) : (periods.data ?? []).length === 0 ? (
        <EmptyState
          icon={Droplet}
          title="এখনো কোনো পিরিয়ড লেখা নেই"
          message="অন্তত শেষ দুটি পিরিয়ডের তারিখ দিলে আপনার নিজের চক্রের হিসাব শুরু হবে।"
        />
      ) : (
        <SurfaceCard className="py-1">
          {periods.data!.map((p) => (
            <PeriodRow key={p.id} p={p} onPress={() => setEditing(p)} />
          ))}
        </SurfaceCard>
      )}
    </ScrollScreen>
  );
}
