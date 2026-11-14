import { router } from 'expo-router';
import {
  Baby,
  CalendarDays,
  ChevronRight,
  Droplet,
  History,
  MessageCircleHeart,
  NotebookPen,
  Settings,
  ShieldCheck,
} from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';

import { apiErrorMessage } from '@/api/api-error-messages';
import { CycleRing } from '@/components/womens-health/cycle-ring';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { IconBadge } from '@/components/ui/icon-badge';
import { ListRow } from '@/components/ui/list-row';
import { IconButton, ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { StatusPill } from '@/components/ui/status-pill';
import { SurfaceCard } from '@/components/ui/surface-card';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { daysUntilText } from '@/features/womens-health/cycle-dates';
import { syncPeriodReminder } from '@/features/womens-health/period-reminder';
import { useCycleOverview, useWomensHealthActions } from '@/features/womens-health/use-womens-health';
import {
  FLOW_LABELS,
  MOOD_LABELS,
  PHASE_META,
  SYMPTOM_LABELS,
  TRIMESTER_LABELS,
  babySizeHint,
} from '@/features/womens-health/womens-health-display';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { dhakaDate, formatDate } from '@/lib/bangla-format';
import { showToast } from '@/lib/user-feedback';
import type { CycleOverviewResponse, PregnancyResponse } from '@/shared-contracts/womens-health.contract';
import { colors } from '@/theme/design-tokens';

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
      <BanglaText variant="caption">{label}</BanglaText>
    </View>
  );
}

function CycleCard({ profileId, o }: { profileId: string; o: CycleOverviewResponse }) {
  const actions = useWomensHealthActions(profileId);
  const phase = PHASE_META[o.phase];
  const today = dhakaDate();
  const last = o.lastPeriod;
  // A period without an end date that started recently is still going on.
  const ongoing = Boolean(last && !last.endDate && (o.cycleDay ?? 99) <= 15);

  const start = () =>
    actions.createPeriod.mutate(
      { startDate: today },
      {
        onSuccess: () => showToast('পিরিয়ড শুরু লেখা হলো'),
        onError: (e) => showToast(apiErrorMessage(e)),
      }
    );
  const end = () =>
    actions.updatePeriod.mutate(
      { periodId: last!.id, body: { endDate: today } },
      {
        onSuccess: () => showToast('পিরিয়ড শেষ লেখা হলো'),
        onError: (e) => showToast(apiErrorMessage(e)),
      }
    );

  return (
    <SurfaceCard className="items-center gap-4">
      <CycleRing overview={o}>
        {o.cycleDay ? (
          <View className="items-center">
            <BanglaText variant="caption">চক্রের দিন</BanglaText>
            <BanglaText className="font-bangla-bold text-[44px] leading-[56px] text-rose">
              {toBanglaDigits(o.cycleDay)}
            </BanglaText>
            {o.daysUntilNextPeriod !== null ? (
              <BanglaText variant="label" className="text-center">
                {o.daysUntilNextPeriod < 0 ? '' : 'পরের পিরিয়ড '}
                {daysUntilText(o.daysUntilNextPeriod)}
              </BanglaText>
            ) : null}
          </View>
        ) : (
          <BanglaText variant="label" className="px-10 text-center text-ink-muted">
            শেষ পিরিয়ডের তারিখ দিলে চক্র দেখা যাবে
          </BanglaText>
        )}
      </CycleRing>

      <View className="items-center gap-1">
        <StatusPill label={phase.label} tone={phase.tone} />
        <BanglaText variant="caption" className="text-center">
          {phase.hint}
        </BanglaText>
      </View>

      {o.cycleDay ? (
        <View className="flex-row flex-wrap justify-center gap-x-4 gap-y-1">
          <Legend color={colors.rose} label="পিরিয়ড" />
          <Legend color="#e7a1b0" label="উর্বর সময়" />
          <Legend color="#8f2a3f" label="ডিম্বস্ফোটন" />
        </View>
      ) : null}

      {o.nextPeriodStart ? (
        <View className="w-full gap-2 rounded-2xl bg-rose-soft/60 p-3.5">
          <Row label="পরের পিরিয়ড" value={formatDate(o.nextPeriodStart, false)} />
          {o.fertileStart && o.fertileEnd ? (
            <Row
              label="উর্বর সময়"
              value={`${formatDate(o.fertileStart, false)} – ${formatDate(o.fertileEnd, false)}`}
            />
          ) : null}
          <Row label="গড় চক্র" value={`${toBanglaDigits(o.avgCycleDays)} দিন · পিরিয়ড ${toBanglaDigits(o.avgPeriodDays)} দিন`} />
        </View>
      ) : null}

      <View className="w-full">
        {!last ? (
          <ActionButton
            label="শেষ পিরিয়ডের তারিখ দিন"
            icon={CalendarDays}
            onPress={() => router.push({ pathname: '/womens-health/periods', params: { add: '1' } })}
          />
        ) : ongoing ? (
          <ActionButton
            label="আজ পিরিয়ড শেষ হয়েছে"
            icon={Droplet}
            variant="outline"
            loading={actions.updatePeriod.isPending}
            onPress={end}
          />
        ) : o.phase !== 'PERIOD' ? (
          <ActionButton
            label="আজ পিরিয়ড শুরু হয়েছে"
            icon={Droplet}
            loading={actions.createPeriod.isPending}
            onPress={start}
          />
        ) : null}
      </View>
    </SurfaceCard>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <BanglaText variant="caption">{label}</BanglaText>
      <BanglaText variant="label" className="font-bangla-semibold">
        {value}
      </BanglaText>
    </View>
  );
}

function PregnancyCard({ p }: { p: PregnancyResponse }) {
  const size = babySizeHint(p.week);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/womens-health/pregnancy')}
      className="gap-3 rounded-3xl bg-rose p-5 active:opacity-95">
      <View className="flex-row items-center gap-3">
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
          <Baby size={26} color={colors.white} />
        </View>
        <View className="flex-1">
          <BanglaText className="font-bangla-bold text-[22px] leading-[32px] text-white">
            {toBanglaDigits(p.week)} সপ্তাহ {toBanglaDigits(p.dayOfWeek)} দিন
          </BanglaText>
          <BanglaText variant="label" className="text-white/85">
            {TRIMESTER_LABELS[p.trimester]} · সম্ভাব্য তারিখ {formatDate(p.dueDate, false)}
          </BanglaText>
        </View>
        <ChevronRight size={22} color={colors.white} />
      </View>
      <View className="h-2 overflow-hidden rounded-full bg-white/25">
        <View className="h-2 rounded-full bg-white" style={{ width: `${Math.min(100, ((280 - p.daysLeft) / 280) * 100)}%` }} />
      </View>
      <BanglaText variant="caption" className="text-white/90">
        আর {toBanglaDigits(p.daysLeft)} দিন{size ? ` · শিশু এখন ${size}` : ''}
      </BanglaText>
    </Pressable>
  );
}

function TodayLogCard({ o }: { o: CycleOverviewResponse }) {
  const log = o.today;
  const parts = log
    ? [
        log.flow && log.flow !== 'NONE' ? `রক্তপাত ${FLOW_LABELS[log.flow]}` : null,
        log.mood ? MOOD_LABELS[log.mood] : null,
        ...log.symptoms.map((s) => SYMPTOM_LABELS[s]),
      ].filter(Boolean)
    : [];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/womens-health/log')}
      className="flex-row items-center gap-3 rounded-3xl border border-line/70 bg-surface-card p-4 active:bg-rose-soft/40">
      <IconBadge icon={NotebookPen} tone="rose" />
      <View className="flex-1">
        <BanglaText variant="body-strong">আজকের অবস্থা</BanglaText>
        <BanglaText variant="caption" numberOfLines={2}>
          {parts.length ? parts.join(' · ') : 'রক্তপাত, মেজাজ আর লক্ষণ লিখে রাখুন'}
        </BanglaText>
      </View>
      <ChevronRight size={20} color={colors.inkMuted} />
    </Pressable>
  );
}

export default function WomensHealthHome() {
  const { profile } = useActiveProfile();
  const overview = useCycleOverview(profile?.id);
  const o = overview.data!;

  useEffect(() => {
    if (profile && overview.data) void syncPeriodReminder(profile.id, overview.data).catch(() => undefined);
  }, [profile, overview.data]);

  if (!profile || !o) return null;

  return (
    <ScrollScreen
      header={
        <ScreenHeader
          title="নারীস্বাস্থ্য"
          subtitle={profile.myRelation === 'SELF' ? undefined : profile.fullName}
          fallbackHref="/home"
          actions={
            <IconButton icon={Settings} label="সেটিংস" onPress={() => router.push('/womens-health/settings')} />
          }
        />
      }
      onRefresh={() => overview.refetch()}>
      {o.pregnancy ? <PregnancyCard p={o.pregnancy} /> : <CycleCard profileId={profile.id} o={o} />}
      <TodayLogCard o={o} />

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/quick-consult', params: { kind: 'WOMENS_HEALTH' } })}
        className="flex-row items-center gap-3 rounded-3xl bg-rose-soft p-4 active:opacity-80">
        <IconBadge icon={MessageCircleHeart} tone="rose" />
        <View className="flex-1">
          <BanglaText variant="body-strong" className="text-rose">
            নারী ডাক্তারের সাথে চ্যাট
          </BanglaText>
          <BanglaText variant="caption" className="text-ink">
            গোপনে প্রশ্ন করুন, অল্প খরচে দ্রুত উত্তর
          </BanglaText>
        </View>
        <ChevronRight size={20} color={colors.rose} />
      </Pressable>

      <SurfaceCard className="gap-1">
        <ListRow
          icon={History}
          title="পিরিয়ডের ইতিহাস"
          subtitle="আগের তারিখগুলো দেখুন, যোগ করুন বা ঠিক করুন"
          onPress={() => router.push('/womens-health/periods')}
          divider
        />
        <ListRow
          icon={Baby}
          title="গর্ভধারণ"
          subtitle={o.pregnancy ? 'সপ্তাহ, ত্রৈমাসিক আর সম্ভাব্য তারিখ' : 'গর্ভবতী হলে সপ্তাহ গুনে রাখুন'}
          onPress={() => router.push('/womens-health/pregnancy')}
        />
      </SurfaceCard>

      <View className="flex-row items-start gap-2 px-1">
        <ShieldCheck size={16} color={colors.inkMuted} />
        <BanglaText variant="caption" className="flex-1">
          এই তথ্য শুধু আপনি দেখতে পান, পরিবারের অন্য সদস্যরা না। তারিখগুলো আপনার আগের পিরিয়ড থেকে করা অনুমান,
          চিকিৎসকের পরামর্শের বিকল্প নয়।
        </BanglaText>
      </View>
    </ScrollScreen>
  );
}
