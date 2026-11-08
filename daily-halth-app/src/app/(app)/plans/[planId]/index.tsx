import { router, useLocalSearchParams } from 'expo-router';
import { CirclePause, PackagePlus, Pencil, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { LabeledTextInput } from '@/components/ui/labeled-text-input';
import { IconButton, ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { ErrorState, SkeletonBlock } from '@/components/ui/state-views';
import { StatusPill } from '@/components/ui/status-pill';
import { SurfaceCard } from '@/components/ui/surface-card';
import { apiErrorMessage } from '@/api/api-error-messages';
import {
  banglaPattern,
  doseText,
  DOSE_UNIT_LABELS,
  mealTimingText,
} from '@/features/medicine/medicine-display';
import { usePlan, usePlanActions } from '@/features/medicine/use-medicine';
import { canEdit } from '@/features/profiles/profile-permissions';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { toAsciiDigits, toBanglaDigits } from '@/lib/bangla-digits';
import { banglaClock, BANGLA_WEEKDAYS_SHORT, formatDate, formatNumber } from '@/lib/bangla-format';
import { confirmAction, showToast } from '@/lib/user-feedback';

export default function PlanDetailScreen() {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const { profile } = useActiveProfile();
  const plan = usePlan(profile?.id, planId);
  const { restock, stop, remove } = usePlanActions(profile?.id ?? '', planId ?? '');
  const editable = canEdit(profile);
  const [restockQty, setRestockQty] = useState('');
  const data = plan.data;

  return (
    <ScrollScreen
      header={
        <ScreenHeader
          title={data?.displayName ?? 'ওষুধ'}
          subtitle={data?.genericName ?? profile?.fullName}
          fallbackHref="/medicine"
          actions={
            editable && data?.isActive ? (
              <IconButton
                icon={Pencil}
                label="বদলান"
                onPress={() =>
                  router.push({ pathname: '/plans/[planId]/edit', params: { planId: data.id } })
                }
              />
            ) : undefined
          }
        />
      }
      onRefresh={() => plan.refetch()}>
      {plan.isLoading ? (
        <SkeletonBlock className="h-64" />
      ) : plan.isError || !data ? (
        <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />
      ) : (
        <>
          <SurfaceCard className="gap-4">
            <View className="flex-row items-center justify-between">
              <BanglaText className="font-bangla-bold text-[28px] leading-[38px] text-primary">
                {banglaPattern(data.pattern)}
              </BanglaText>
              <StatusPill
                label={data.isActive ? 'চলছে' : 'বন্ধ'}
                tone={data.isActive ? 'success' : 'neutral'}
              />
            </View>
            {data.times.map((time) => (
              <View
                key={time.id}
                className="flex-row items-center justify-between border-t border-line/60 pt-3">
                <View>
                  <BanglaText variant="body-strong">{banglaClock(time.time)}</BanglaText>
                  <BanglaText variant="caption">
                    {time.days.length === 7
                      ? 'প্রতিদিন'
                      : time.days.map((d) => BANGLA_WEEKDAYS_SHORT[d]).join(', ')}
                  </BanglaText>
                </View>
                <BanglaText variant="body-strong">{doseText(time.dose, data.doseUnit)}</BanglaText>
              </View>
            ))}
            <BanglaText variant="caption">
              {[
                mealTimingText(data.mealTiming, data.mealOffsetMin),
                `${formatDate(data.startDate)} থেকে`,
                data.endDate ? `${formatDate(data.endDate)} পর্যন্ত` : 'চলতে থাকবে',
              ]
                .filter(Boolean)
                .join(' · ')}
            </BanglaText>
          </SurfaceCard>

          <SurfaceCard className="gap-3">
            <BanglaText variant="body-strong">ঘরে আছে</BanglaText>
            {data.stockQty === null ? (
              <BanglaText variant="caption">
                হিসাব রাখা হচ্ছে না। কিনলে সংখ্যা দিন, ফুরানোর আগে মনে করিয়ে দেব।
              </BanglaText>
            ) : (
              <View className="flex-row items-center justify-between">
                <BanglaText className="font-bangla-bold text-[22px] leading-[30px]">
                  {formatNumber(data.stockQty)} {DOSE_UNIT_LABELS[data.doseUnit]}
                </BanglaText>
                {data.stockDaysLeft !== null ? (
                  <StatusPill
                    label={
                      data.stockDaysLeft <= 0
                        ? 'আজই শেষ'
                        : `${toBanglaDigits(data.stockDaysLeft)} দিন চলবে`
                    }
                    tone={data.lowStock ? 'warning' : 'success'}
                  />
                ) : null}
              </View>
            )}
            {editable && data.isActive ? (
              <View className="flex-row items-end gap-3">
                <View className="flex-1">
                  <LabeledTextInput
                    label="নতুন কিনেছেন?"
                    value={restockQty}
                    onChangeText={setRestockQty}
                    placeholder="কতগুলো, যেমন ৩০"
                    keyboardType="decimal-pad"
                    maxLength={6}
                  />
                </View>
                <ActionButton
                  label="যোগ করুন"
                  icon={PackagePlus}
                  size="sm"
                  fullWidth={false}
                  loading={restock.isPending}
                  disabled={!restockQty.trim()}
                  onPress={() => {
                    const quantity = Number(toAsciiDigits(restockQty).replace(',', '.'));
                    if (!Number.isFinite(quantity) || quantity <= 0) {
                      showToast('সঠিক সংখ্যা লিখুন');
                      return;
                    }
                    restock.mutate(Math.round(quantity * 4) / 4, {
                      onSuccess: () => {
                        setRestockQty('');
                        showToast('স্টক যোগ হয়েছে');
                      },
                      onError: (error) => showToast(apiErrorMessage(error)),
                    });
                  }}
                />
              </View>
            ) : null}
          </SurfaceCard>

          {editable && data.isActive ? (
            <View className="gap-2">
              <ActionButton
                label="ওষুধ বন্ধ করুন"
                icon={CirclePause}
                variant="outline"
                size="sm"
                loading={stop.isPending}
                onPress={async () => {
                  const ok = await confirmAction({
                    title: `${data.displayName} বন্ধ করবেন?`,
                    message: 'অ্যালার্ম আর বাজবে না। আগের খাওয়ার হিসাব থেকে যাবে।',
                    confirmLabel: 'বন্ধ করুন',
                  });
                  if (ok)
                    stop.mutate(undefined, { onSuccess: () => showToast('ওষুধ বন্ধ করা হয়েছে') });
                }}
              />
              <ActionButton
                label="ভুল করে যোগ হয়েছে, মুছে ফেলুন"
                icon={Trash2}
                variant="danger"
                size="sm"
                loading={remove.isPending}
                onPress={async () => {
                  const ok = await confirmAction({
                    title: `${data.displayName} মুছবেন?`,
                    message: 'এই ওষুধের সব খাওয়ার হিসাবও মুছে যাবে।',
                    confirmLabel: 'মুছে ফেলুন',
                    destructive: true,
                  });
                  if (!ok) return;
                  remove.mutate(undefined, {
                    onSuccess: () => {
                      showToast('মুছে ফেলা হয়েছে');
                      router.back();
                    },
                    onError: (error) => showToast(apiErrorMessage(error)),
                  });
                }}
              />
            </View>
          ) : null}
        </>
      )}
    </ScrollScreen>
  );
}
