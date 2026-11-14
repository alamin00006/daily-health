import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { DietPlanEditor } from '@/components/provider/diet-plan-editor';
import { BanglaText } from '@/components/ui/bangla-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { ErrorState, SkeletonBlock } from '@/components/ui/state-views';
import { StatusPill } from '@/components/ui/status-pill';
import { SurfaceCard } from '@/components/ui/surface-card';
import { DIET_STATUS_LABEL, DIET_STATUS_TONE, MEAL_LABEL, useProviderDietPlan } from '@/features/nutrition/use-diet';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { banglaClock, formatDate } from '@/lib/bangla-format';
import type { ProviderDietPlanResponse } from '@/shared-contracts/nutrition.contract';

function EndedView({ p }: { p: ProviderDietPlanResponse }) {
  return (
    <SurfaceCard className="gap-3">
      <BanglaText variant="body-strong">{p.title}</BanglaText>
      <BanglaText variant="caption">
        {toBanglaDigits(p.calorieTargetKcal)} kcal · {toBanglaDigits(p.waterTargetMl)} মিলি পানি · {formatDate(p.startDate)}
        {p.endDate ? ` – ${formatDate(p.endDate)}` : ''}
      </BanglaText>
      {p.meals.map((m) => (
        <View key={m.id} className="border-t border-line/60 pt-2">
          <BanglaText variant="body-strong">
            {MEAL_LABEL[m.mealType]} · {banglaClock(m.time)}
          </BanglaText>
          <BanglaText>{m.description}</BanglaText>
        </View>
      ))}
      {p.notes ? (
        <BanglaText variant="caption" className="text-ink">
          {p.notes}
        </BanglaText>
      ) : null}
    </SurfaceCard>
  );
}

/** One diet chart: a draft or an active one (editable), or an ended one (read only). */
export default function ProviderDietPlanScreen() {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const query = useProviderDietPlan(planId);
  const p = query.data;
  return (
    <ScrollScreen
      header={
        <ScreenHeader
          title={p?.patientName ?? 'ডায়েট চার্ট'}
          subtitle={p ? [p.patientCode, p.appointmentCode].filter(Boolean).join(' · ') : undefined}
          fallbackHref="/provider/diet-plans"
          actions={p ? <StatusPill label={DIET_STATUS_LABEL[p.status]} tone={DIET_STATUS_TONE[p.status]} /> : null}
        />
      }>
      {query.isLoading ? (
        <SkeletonBlock className="h-96" />
      ) : query.isError || !p ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : p.status === 'ENDED' ? (
        <EndedView p={p} />
      ) : (
        <DietPlanEditor key={`${p.id}-${p.status}`} plan={p} />
      )}
    </ScrollScreen>
  );
}
