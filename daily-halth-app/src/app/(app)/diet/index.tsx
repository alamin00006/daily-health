import { router } from 'expo-router';
import { Apple, Check, ChevronLeft, ChevronRight, Droplets, Minus, Plus, Stethoscope } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { apiErrorMessage } from '@/api/api-error-messages';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { SectionHeader } from '@/components/ui/list-row';
import { ProgressRing } from '@/components/ui/progress-ring';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { EmptyState, ErrorState, LoadingList } from '@/components/ui/state-views';
import { SurfaceCard } from '@/components/ui/surface-card';
import { canEdit } from '@/features/profiles/profile-permissions';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { DIET_STATUS_LABEL, MEAL_LABEL, useDietDay, useDietDayActions, useDietPlans } from '@/features/nutrition/use-diet';
import { addDays, banglaClock, dhakaDate, formatDate, relativeDay } from '@/lib/bangla-format';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { showToast } from '@/lib/user-feedback';
import { colors } from '@/theme/design-tokens';

const WATER_STEP = 250;
const EDITABLE_DAYS = 7;

/** Today's diet chart: tick the meals, add water, see the day against the targets. */
export default function DietScreen() {
  const { profile } = useActiveProfile();
  const today = dhakaDate();
  const [date, setDate] = useState(today);
  const day = useDietDay(profile?.id, date);
  const plans = useDietPlans(profile?.id);
  const actions = useDietDayActions(profile?.id ?? '', date);
  const d = day.data;
  const editable = Boolean(profile && canEdit(profile)) && date <= today && date >= addDays(today, -EDITABLE_DAYS);
  const fail = (e: unknown) => showToast(apiErrorMessage(e));
  const water = d?.waterMl ?? 0;
  const waterTarget = d?.plan?.waterTargetMl ?? 0;
  const kcalTarget = d?.plan?.calorieTargetKcal ?? 0;

  return (
    <ScrollScreen
      header={<ScreenHeader title="ডায়েট চার্ট" subtitle={profile?.fullName} fallbackHref="/home" />}
      onRefresh={() => Promise.all([day.refetch(), plans.refetch()])}>
      <View className="flex-row items-center justify-between rounded-2xl bg-surface-card px-2">
        <Pressable accessibilityRole="button" accessibilityLabel="আগের দিন" onPress={() => setDate(addDays(date, -1))} className="h-12 w-12 items-center justify-center">
          <ChevronLeft size={22} color={colors.ink} />
        </Pressable>
        <BanglaText variant="body-strong">{relativeDay(date) || formatDate(date)}</BanglaText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="পরের দিন"
          disabled={date >= today}
          onPress={() => setDate(addDays(date, 1))}
          className={`h-12 w-12 items-center justify-center ${date >= today ? 'opacity-30' : ''}`}>
          <ChevronRight size={22} color={colors.ink} />
        </Pressable>
      </View>

      {day.isLoading ? (
        <LoadingList rows={3} rowClassName="h-28" />
      ) : day.isError ? (
        <ErrorState error={day.error} onRetry={() => void day.refetch()} />
      ) : !d?.plan ? (
        <EmptyState
          icon={Apple}
          title="এখনো কোনো ডায়েট চার্ট নেই"
          message="পুষ্টিবিদের সাথে অ্যাপয়েন্টমেন্ট নিলে, দেখার পর তিনি এখানে ৪ বেলার খাবারের তালিকা দেবেন।"
          actionLabel="পুষ্টিবিদ খুঁজুন"
          onAction={() => router.push({ pathname: '/doctors', params: { type: 'NUTRITIONIST' } })}
        />
      ) : (
        <>
          <View className="flex-row gap-3">
            <SurfaceCard className="flex-1 items-center gap-2">
              <ProgressRing progress={kcalTarget ? d.caloriesKcal / kcalTarget : 0} color={colors.nutrition} trackColor={colors.nutritionSoft}>
                <Apple size={22} color={colors.nutrition} />
              </ProgressRing>
              <BanglaText variant="body-strong">
                {toBanglaDigits(d.caloriesKcal)} / {toBanglaDigits(kcalTarget)}
              </BanglaText>
              <BanglaText variant="caption">ক্যালরি (kcal)</BanglaText>
            </SurfaceCard>
            <SurfaceCard className="flex-1 items-center gap-2">
              <ProgressRing progress={waterTarget ? water / waterTarget : 0} color="#1d6fa5" trackColor="#dcebf5">
                <Droplets size={22} color="#1d6fa5" />
              </ProgressRing>
              <BanglaText variant="body-strong">
                {toBanglaDigits((water / 1000).toFixed(2).replace(/\.?0+$/, ''))} / {toBanglaDigits(waterTarget / 1000)} লিটার
              </BanglaText>
              {editable ? (
                <View className="flex-row gap-2">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="২৫০ মিলি কম"
                    disabled={water <= 0}
                    onPress={() => actions.setWater.mutate(Math.max(0, water - WATER_STEP), { onError: fail })}
                    className="h-11 w-11 items-center justify-center rounded-full border border-line">
                    <Minus size={18} color={colors.ink} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="এক গ্লাস (২৫০ মিলি) পানি খেয়েছি"
                    onPress={() => actions.setWater.mutate(water + WATER_STEP, { onError: fail })}
                    className="h-11 flex-row items-center gap-1 rounded-full bg-[#1d6fa5] px-3">
                    <Plus size={18} color={colors.white} />
                    <BanglaText variant="label" className="text-white">
                      এক গ্লাস
                    </BanglaText>
                  </Pressable>
                </View>
              ) : null}
            </SurfaceCard>
          </View>

          <SectionHeader title="আজকের খাবার" />
          {d.meals.map((m) => (
            <Pressable
              key={m.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: m.followed, disabled: !editable }}
              accessibilityLabel={`${MEAL_LABEL[m.mealType]}: ${m.description}`}
              disabled={!editable}
              onPress={() => actions.setMeal.mutate({ mealId: m.id, followed: !m.followed }, { onError: fail })}
              className={`flex-row gap-3 rounded-2xl border p-4 ${m.followed ? 'border-nutrition/40 bg-nutrition-soft' : 'border-line bg-surface-card'}`}>
              <View
                className={`mt-1 h-7 w-7 items-center justify-center rounded-full border-2 ${m.followed ? 'border-nutrition bg-nutrition' : 'border-line-strong'}`}>
                {m.followed ? <Check size={16} color={colors.white} strokeWidth={3} /> : null}
              </View>
              <View className="flex-1 gap-0.5">
                <View className="flex-row items-center justify-between">
                  <BanglaText variant="body-strong">{MEAL_LABEL[m.mealType]}</BanglaText>
                  <BanglaText variant="caption">{banglaClock(m.time)}</BanglaText>
                </View>
                <BanglaText variant="body">{m.description}</BanglaText>
                {m.approxKcal !== null ? <BanglaText variant="caption">প্রায় {toBanglaDigits(m.approxKcal)} kcal</BanglaText> : null}
              </View>
            </Pressable>
          ))}
          {!editable && date < addDays(today, -EDITABLE_DAYS) ? (
            <BanglaText variant="caption" className="text-center">
              ৭ দিনের বেশি পুরোনো দিন আর বদলানো যায় না।
            </BanglaText>
          ) : null}

          <SurfaceCard>
            <View className="flex-row items-center gap-2">
              <Stethoscope size={18} color={colors.nutrition} />
              <BanglaText variant="body-strong" className="flex-1">
                {d.plan.title}
              </BanglaText>
            </View>
            <BanglaText variant="caption">
              {d.plan.provider?.displayName ?? 'পুষ্টিবিদ'} · {formatDate(d.plan.startDate)}
              {d.plan.endDate ? ` – ${formatDate(d.plan.endDate)}` : ' থেকে'}
            </BanglaText>
            {d.plan.notes ? <BanglaText variant="body" className="mt-2">{d.plan.notes}</BanglaText> : null}
          </SurfaceCard>
        </>
      )}

      {(plans.data ?? []).length > 1 ? (
        <View className="gap-2">
          <SectionHeader title="আগের চার্ট" />
          {(plans.data ?? [])
            .filter((p) => p.id !== d?.plan?.id)
            .map((p) => (
              <SurfaceCard key={p.id}>
                <BanglaText variant="body-strong">{p.title}</BanglaText>
                <BanglaText variant="caption">
                  {DIET_STATUS_LABEL[p.status]} · {p.provider?.displayName ?? ''} · {formatDate(p.startDate)}
                  {p.endDate ? ` – ${formatDate(p.endDate)}` : ''}
                </BanglaText>
              </SurfaceCard>
            ))}
        </View>
      ) : null}
      {d?.plan ? (
        <ActionButton
          label="আবার পুষ্টিবিদ দেখান"
          variant="outline"
          onPress={() => router.push({ pathname: '/doctors', params: { type: 'NUTRITIONIST' } })}
        />
      ) : null}
    </ScrollScreen>
  );
}
