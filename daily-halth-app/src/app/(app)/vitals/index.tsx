import { router, useLocalSearchParams } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { TrendChart } from '@/components/charts/trend-chart';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ChipSelect } from '@/components/ui/chip-select';
import { SectionHeader } from '@/components/ui/list-row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { EmptyState, ErrorState, LoadingList, SkeletonBlock } from '@/components/ui/state-views';
import { StatusPill } from '@/components/ui/status-pill';
import { SurfaceCard } from '@/components/ui/surface-card';
import { apiErrorMessage } from '@/api/api-error-messages';
import {
  formatVitalValue,
  GLUCOSE_CONTEXT_LABELS,
  VITAL_META,
  VITAL_NORMAL_BAND,
  VITAL_STATUS_META,
  VITAL_TYPES,
} from '@/features/health/health-display';
import { useRemoveVital, useVitals } from '@/features/health/use-health';
import { canEdit } from '@/features/profiles/profile-permissions';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { formatDateTime, formatNumber } from '@/lib/bangla-format';
import { confirmAction, showToast } from '@/lib/user-feedback';
import type { VitalReadingResponse, VitalType } from '@/shared-contracts/health.contract';
import { colors } from '@/theme/design-tokens';

const TYPE_OPTIONS = VITAL_TYPES.map((value) => ({ value, label: VITAL_META[value].shortLabel }));

function LatestCard({ reading }: { reading: VitalReadingResponse }) {
  const meta = VITAL_META[reading.type];
  const status = reading.status ? VITAL_STATUS_META[reading.status] : null;
  return (
    <SurfaceCard className="gap-2">
      <BanglaText variant="caption">সবশেষ · {formatDateTime(reading.measuredAt)}</BanglaText>
      <View className="flex-row items-end gap-2">
        <BanglaText className="font-bangla-bold text-[36px] leading-[46px]">
          {formatVitalValue(reading)}
        </BanglaText>
        <BanglaText variant="label" className="pb-2 font-bangla text-ink-muted">
          {meta.unit}
        </BanglaText>
      </View>
      <View className="flex-row flex-wrap items-center gap-2">
        {status ? <StatusPill label={status.label} tone={status.tone} /> : null}
        {reading.context ? (
          <StatusPill label={GLUCOSE_CONTEXT_LABELS[reading.context]} tone="neutral" />
        ) : null}
        {reading.bmi ? <StatusPill label={`BMI ${formatNumber(reading.bmi)}`} tone="info" /> : null}
      </View>
      {reading.type === 'WEIGHT' && !reading.status ? (
        <BanglaText variant="caption">
          উচ্চতা দিলে BMI আর অবস্থা দেখাবে (প্রোফাইলের তথ্যে)।
        </BanglaText>
      ) : null}
      <BanglaText variant="caption" className="text-ink-subtle">
        এটি শুধু একটি ধারণা, রোগ নির্ণয় নয়। চিকিৎসার জন্য ডাক্তারের পরামর্শ নিন।
      </BanglaText>
    </SurfaceCard>
  );
}

export default function VitalsScreen() {
  const params = useLocalSearchParams<{ type?: VitalType }>();
  const [type, setType] = useState<VitalType>(
    params.type && VITAL_TYPES.includes(params.type) ? params.type : 'BP'
  );
  const { profile } = useActiveProfile();
  const editable = canEdit(profile);
  const vitals = useVitals(profile?.id, type);
  const remove = useRemoveVital(profile?.id ?? '');

  const readings = vitals.data?.pages.flatMap((page) => page.data) ?? [];
  const chartReadings = readings.slice(0, 30).reverse();
  const series =
    type === 'BP'
      ? [
          { values: chartReadings.map((r) => r.systolic ?? 0), color: colors.primary },
          { values: chartReadings.map((r) => r.diastolic ?? 0), color: colors.primary300 },
        ]
      : [{ values: chartReadings.map((r) => r.value ?? 0), color: colors.primary }];

  const deleteReading = async (reading: VitalReadingResponse) => {
    const ok = await confirmAction({
      title: 'এই মাপটি মুছবেন?',
      message: `${formatVitalValue(reading)} ${VITAL_META[reading.type].unit}, ${formatDateTime(reading.measuredAt)}`,
      confirmLabel: 'মুছে ফেলুন',
      destructive: true,
    });
    if (ok) remove.mutate(reading.id, { onError: (error) => showToast(apiErrorMessage(error)) });
  };

  return (
    <ScrollScreen
      header={<ScreenHeader title="ভাইটালস" subtitle={profile?.fullName} fallbackHref="/health" />}
      onRefresh={() => vitals.refetch()}
      footer={
        editable ? (
          <ActionButton
            label={`${VITAL_META[type].shortLabel} লিখুন`}
            icon={Plus}
            onPress={() => router.push({ pathname: '/vitals/new', params: { type } })}
          />
        ) : undefined
      }>
      <ChipSelect options={TYPE_OPTIONS} value={type} onChange={setType} scroll />

      {vitals.isLoading ? (
        <>
          <SkeletonBlock className="h-36" />
          <LoadingList rows={3} rowClassName="h-16" />
        </>
      ) : vitals.isError ? (
        <ErrorState error={vitals.error} onRetry={() => void vitals.refetch()} />
      ) : readings.length === 0 ? (
        <EmptyState
          icon={VITAL_META[type].icon}
          title={`এখনো কোনো ${VITAL_META[type].label}-এর মাপ নেই`}
          message="নিয়মিত মেপে লিখে রাখলে ডাক্তারকে সময়ের সাথে পরিবর্তন দেখাতে পারবেন।"
        />
      ) : (
        <>
          <LatestCard reading={readings[0]!} />
          {chartReadings.length >= 2 ? (
            <SurfaceCard className="gap-2">
              <View className="flex-row items-center justify-between">
                <BanglaText variant="body-strong">
                  সবশেষ {formatNumber(chartReadings.length, 0)}টি মাপ
                </BanglaText>
                {type === 'BP' ? (
                  <View className="flex-row gap-3">
                    <Legend color={colors.primary} label="উপরের" />
                    <Legend color={colors.primary300} label="নিচের" />
                  </View>
                ) : null}
              </View>
              <TrendChart series={series} normalBand={VITAL_NORMAL_BAND[type]} />
              <BanglaText variant="caption">হালকা সবুজ অংশ স্বাভাবিক সীমা।</BanglaText>
            </SurfaceCard>
          ) : null}

          <SectionHeader title="সব মাপ" />
          <SurfaceCard className="py-1">
            {readings.map((reading, index) => {
              const status = reading.status ? VITAL_STATUS_META[reading.status] : null;
              return (
                <Pressable
                  key={reading.id}
                  accessibilityRole="button"
                  accessibilityHint={editable ? 'মুছতে চাপ দিয়ে ধরে রাখুন' : undefined}
                  onLongPress={editable ? () => void deleteReading(reading) : undefined}
                  className={`flex-row items-center gap-3 py-3 ${index < readings.length - 1 ? 'border-b border-line/60' : ''}`}>
                  <View className="flex-1">
                    <BanglaText variant="body-strong">
                      {formatVitalValue(reading)}{' '}
                      <BanglaText variant="caption">{VITAL_META[type].unit}</BanglaText>
                    </BanglaText>
                    <BanglaText variant="caption">
                      {formatDateTime(reading.measuredAt)}
                      {reading.context ? ` · ${GLUCOSE_CONTEXT_LABELS[reading.context]}` : ''}
                      {reading.note ? ` · ${reading.note}` : ''}
                    </BanglaText>
                  </View>
                  {status ? <StatusPill label={status.label} tone={status.tone} /> : null}
                </Pressable>
              );
            })}
          </SurfaceCard>
          {vitals.hasNextPage ? (
            <ActionButton
              label="আরও দেখুন"
              variant="ghost"
              size="sm"
              loading={vitals.isFetchingNextPage}
              onPress={() => void vitals.fetchNextPage()}
            />
          ) : null}
          {editable ? (
            <BanglaText variant="caption" className="text-center text-ink-subtle">
              ভুল মাপ মুছতে সেটির ওপর চাপ দিয়ে ধরে রাখুন
            </BanglaText>
          ) : null}
        </>
      )}
    </ScrollScreen>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <BanglaText variant="caption">{label}</BanglaText>
    </View>
  );
}
