import { router } from 'expo-router';
import { Apple, ChevronRight, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { BanglaText } from '@/components/ui/bangla-text';
import { ChipSelect } from '@/components/ui/chip-select';
import { SectionHeader } from '@/components/ui/list-row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { EmptyState, ErrorState, LoadingList } from '@/components/ui/state-views';
import { StatusPill } from '@/components/ui/status-pill';
import { DIET_STATUS_LABEL, DIET_STATUS_TONE, useDietCandidates, useProviderDietPlans } from '@/features/nutrition/use-diet';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { formatDate, formatDateTime } from '@/lib/bangla-format';
import { colors } from '@/theme/design-tokens';

const TABS = [
  { value: 'ALL', label: 'সব' },
  { value: 'DRAFT', label: 'খসড়া' },
  { value: 'ACTIVE', label: 'চালু' },
  { value: 'ENDED', label: 'শেষ' },
];

/** Diet charts this nutritionist wrote, and recent visits that still need one. */
export default function ProviderDietPlansScreen() {
  const [status, setStatus] = useState('ALL');
  const list = useProviderDietPlans();
  const candidates = useDietCandidates();
  const rows = (list.data?.data ?? []).filter((p) => status === 'ALL' || p.status === status);
  const waiting = (candidates.data ?? []).filter((c) => !c.existingPlanId);

  return (
    <ScrollScreen
      header={<ScreenHeader title="ডায়েট চার্ট" fallbackHref="/provider" />}
      onRefresh={() => Promise.all([list.refetch(), candidates.refetch()])}>
      {waiting.length ? (
        <View className="gap-2">
          <SectionHeader title="চার্ট দেওয়া বাকি" />
          {waiting.map((c) => (
            <Pressable
              key={c.appointmentId}
              accessibilityRole="button"
              accessibilityLabel={`${c.patientName ?? 'রোগী'}: নতুন চার্ট`}
              onPress={() =>
                router.push({ pathname: '/provider/diet-plans/new', params: { appointmentId: c.appointmentId, patientName: c.patientName ?? '' } })
              }
              className="flex-row items-center gap-3 rounded-3xl border border-dashed border-nutrition/50 bg-nutrition-soft p-4 active:opacity-80">
              <View className="h-11 w-11 items-center justify-center rounded-2xl bg-surface-card">
                <Plus size={22} color={colors.nutrition} />
              </View>
              <View className="flex-1">
                <BanglaText variant="body-strong" numberOfLines={1}>
                  {c.patientName ?? 'রোগী'}
                </BanglaText>
                <BanglaText variant="caption" numberOfLines={1}>
                  {c.appointmentCode} · {formatDateTime(c.scheduledAt)}
                </BanglaText>
              </View>
              <ChevronRight size={20} color={colors.inkSubtle} />
            </Pressable>
          ))}
        </View>
      ) : null}

      <SectionHeader title="লেখা চার্ট" />
      <ChipSelect options={TABS} value={status} onChange={setStatus} scroll />
      {list.isLoading ? (
        <LoadingList rows={3} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Apple} title="কোনো চার্ট নেই" message="রোগী দেখার পর (গত ৬০ দিনের ভিজিট) এখান থেকে ডায়েট চার্ট লিখুন।" />
      ) : (
        <View className="gap-3">
          {rows.map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/provider/diet-plans/[planId]', params: { planId: p.id } })}
              className="flex-row items-center gap-3 rounded-3xl border border-line bg-surface-card p-4 active:bg-primary-50">
              <View className="h-11 w-11 items-center justify-center rounded-2xl bg-nutrition-soft">
                <Apple size={22} color={colors.nutrition} />
              </View>
              <View className="flex-1">
                <BanglaText variant="body-strong" numberOfLines={1}>
                  {p.patientName ?? 'রোগী'} · {p.title}
                </BanglaText>
                <BanglaText variant="caption" numberOfLines={1}>
                  {toBanglaDigits(p.calorieTargetKcal)} kcal · {toBanglaDigits(p.meals.length)} বেলা · {formatDate(p.startDate)}
                </BanglaText>
              </View>
              <StatusPill label={DIET_STATUS_LABEL[p.status]} tone={DIET_STATUS_TONE[p.status]} />
            </Pressable>
          ))}
        </View>
      )}
    </ScrollScreen>
  );
}
