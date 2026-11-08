import { router } from 'expo-router';
import { CircleAlert, Pill, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { CreateOwnProfileCard, GuestNotice } from '@/components/app/account-gates';
import { AlarmReliabilityCard } from '@/components/medicine/alarm-reliability-card';
import { DoseRow } from '@/components/medicine/dose-row';
import { ActiveProfileChip } from '@/components/profile/active-profile-chip';
import { BanglaText } from '@/components/ui/bangla-text';
import { ListRow, SectionHeader } from '@/components/ui/list-row';
import { ProgressRing } from '@/components/ui/progress-ring';
import { IconButton } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { EmptyState, ErrorState, LoadingList, SkeletonBlock } from '@/components/ui/state-views';
import { StatusPill } from '@/components/ui/status-pill';
import { SurfaceCard } from '@/components/ui/surface-card';
import { apiErrorMessage } from '@/api/api-error-messages';
import { banglaPattern } from '@/features/medicine/medicine-display';
import {
  useAdherence,
  useDaySchedule,
  usePlans,
  useRecordDose,
} from '@/features/medicine/use-medicine';
import { canEdit } from '@/features/profiles/profile-permissions';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { toBanglaDigits } from '@/lib/bangla-digits';
import {
  addDays,
  BANGLA_WEEKDAYS_SHORT,
  dayPeriod,
  dhakaDate,
  formatDate,
  relativeDay,
  weekdayOf,
} from '@/lib/bangla-format';
import { showToast } from '@/lib/user-feedback';
import type { DoseSlotResponse, RecordDoseRequest } from '@/shared-contracts/medicine.contract';
import type { PatientProfileResponse } from '@/shared-contracts/profiles.contract';
import { useSessionStore } from '@/stores/session-store';
import { colors } from '@/theme/design-tokens';

function doseHeading(date: string): string {
  const today = dhakaDate();
  if (date === today) return 'আজকের ডোজ';
  if (date === addDays(today, -1)) return 'গতকালের ডোজ';
  if (date === addDays(today, 1)) return 'আগামীকালের ডোজ';
  return `${formatDate(date, false)} তারিখের ডোজ`;
}

/** Today and the six days before it, plus tomorrow. */
function DateStrip({ value, onChange }: { value: string; onChange: (date: string) => void }) {
  const today = dhakaDate();
  const dates = Array.from({ length: 8 }, (_, i) => addDays(today, i - 6));
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 pr-5"
      // Start scrolled to today.
      contentOffset={{ x: 280, y: 0 }}>
      {dates.map((date) => {
        const selected = date === value;
        const isToday = date === today;
        return (
          <Pressable
            key={date}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={relativeDay(date)}
            onPress={() => onChange(date)}
            className={`h-[68px] w-[54px] items-center justify-center gap-0.5 rounded-2xl border ${
              selected
                ? 'border-primary bg-primary'
                : 'border-line/70 bg-surface-card active:bg-primary-50'
            }`}>
            <BanglaText
              className={`text-[12px] leading-[17px] ${selected ? 'text-primary-100' : 'text-ink-muted'}`}>
              {isToday ? 'আজ' : BANGLA_WEEKDAYS_SHORT[weekdayOf(date)]}
            </BanglaText>
            <BanglaText
              className={`font-bangla-bold text-[18px] leading-[24px] ${selected ? 'text-white' : 'text-ink'}`}>
              {toBanglaDigits(Number(date.slice(8)))}
            </BanglaText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function AdherenceCard({ profileId }: { profileId: string }) {
  const adherence = useAdherence(profileId, 7);
  if (adherence.isLoading) return <SkeletonBlock className="h-28" />;
  const data = adherence.data;
  if (!data || data.percent === null) return null;
  const percent = data.percent;
  const tone = percent >= 80 ? colors.success : percent >= 50 ? colors.warning : colors.danger;
  return (
    <SurfaceCard className="flex-row items-center gap-4">
      <ProgressRing progress={percent / 100} color={tone} size={72}>
        <BanglaText className="font-bangla-bold text-[17px] leading-[24px]">
          {toBanglaDigits(percent)}%
        </BanglaText>
      </ProgressRing>
      <View className="flex-1 gap-1">
        <BanglaText variant="body-strong">গত ৭ দিনে সেবনের হার</BanglaText>
        <BanglaText variant="caption">
          {toBanglaDigits(data.scheduled)}টি ডোজের মধ্যে {toBanglaDigits(data.taken)}টি নেওয়া
          হয়েছে
          {data.missed > 0 ? `, ${toBanglaDigits(data.missed)}টি বাদ পড়েছে` : ''}
        </BanglaText>
        <View className="mt-1 flex-row items-end gap-1">
          {data.daily.map((day) => (
            <View
              key={day.date}
              className="w-3 rounded-full"
              style={{
                height: 6 + (day.scheduled ? (day.taken / day.scheduled) * 22 : 0),
                backgroundColor:
                  day.scheduled && day.taken === day.scheduled ? colors.success : colors.primary300,
              }}
            />
          ))}
        </View>
      </View>
    </SurfaceCard>
  );
}

function DoseList({ profile, date }: { profile: PatientProfileResponse; date: string }) {
  const day = useDaySchedule(profile.id, date);
  const record = useRecordDose(profile.id);
  const editable = canEdit(profile) && date <= dhakaDate();

  const groups = useMemo(() => {
    const map = new Map<string, DoseSlotResponse[]>();
    for (const dose of day.data?.doses ?? []) {
      const period = dayPeriod(Number(dose.time.slice(0, 2)));
      map.set(period, [...(map.get(period) ?? []), dose]);
    }
    return [...map.entries()];
  }, [day.data]);

  if (day.isLoading) return <LoadingList rows={3} rowClassName="h-28" />;
  if (day.isError) return <ErrorState error={day.error} onRetry={() => void day.refetch()} />;
  if (groups.length === 0) {
    return (
      <EmptyState
        icon={Pill}
        title={`${relativeDay(date)} কোনো ওষুধ নেই`}
        message={canEdit(profile) ? 'ওষুধ যোগ করলে প্রতিটি ডোজের সময় অ্যালার্ম বাজবে।' : undefined}
        actionLabel={canEdit(profile) ? 'ওষুধ যোগ করুন' : undefined}
        onAction={() => router.push('/plans/new')}
      />
    );
  }

  const act = (dose: DoseSlotResponse, status: RecordDoseRequest['status']) =>
    record.mutate(
      {
        planId: dose.planId,
        scheduledFor: dose.scheduledFor,
        status,
        ...(status === 'SNOOZED' ? { snoozeMinutes: 10 } : {}),
      },
      {
        onSuccess: ({ queued }) => {
          if (queued) showToast('রাখা হলো। নেট এলে পাঠানো হবে।');
          else if (status === 'TAKEN') showToast('সেবন করা হিসেবে রাখা হলো');
        },
        onError: (error) => showToast(apiErrorMessage(error)),
      }
    );

  return (
    <View className="gap-4">
      {groups.map(([period, doses]) => (
        <View key={period} className="gap-2.5">
          <BanglaText variant="label" className="font-bangla-semibold text-ink-muted">
            {period}
          </BanglaText>
          {doses.map((dose) => (
            <DoseRow
              key={`${dose.planId}-${dose.scheduledFor}`}
              dose={dose}
              canAct={editable}
              busy={record.isPending && record.variables?.scheduledFor === dose.scheduledFor}
              onAction={(status) => act(dose, status)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function PlansList({ profile }: { profile: PatientProfileResponse }) {
  const plans = usePlans(profile.id);
  const active = (plans.data ?? []).filter((p) => p.isActive);
  const stopped = (plans.data ?? []).filter((p) => !p.isActive);
  if (plans.isLoading || (active.length === 0 && stopped.length === 0)) return null;
  return (
    <View className="gap-3">
      <SectionHeader title="সব ওষুধ" />
      <SurfaceCard className="gap-0 py-2">
        {active.map((plan, index) => (
          <ListRow
            key={plan.id}
            icon={plan.lowStock ? CircleAlert : Pill}
            iconTone={plan.lowStock ? 'danger' : 'primary'}
            title={plan.displayName}
            subtitle={[
              banglaPattern(plan.pattern),
              plan.stockDaysLeft !== null
                ? `${toBanglaDigits(Math.max(plan.stockDaysLeft, 0))} দিনের ওষুধ আছে`
                : null,
              plan.endDate ? `${relativeDay(plan.endDate)} শেষ` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            trailing={
              plan.lowStock ? <StatusPill label="ফুরিয়ে আসছে" tone="warning" /> : undefined
            }
            onPress={() =>
              router.push({ pathname: '/plans/[planId]', params: { planId: plan.id } })
            }
            divider={index < active.length - 1 || stopped.length > 0}
          />
        ))}
        {stopped.length > 0 ? (
          <ListRow
            title={`বন্ধ করা ওষুধ (${toBanglaDigits(stopped.length)})`}
            subtitle={stopped.map((p) => p.displayName).join(', ')}
            onPress={() =>
              router.push({ pathname: '/plans/[planId]', params: { planId: stopped[0]!.id } })
            }
          />
        ) : null}
      </SurfaceCard>
    </View>
  );
}

export default function MedicineScreen() {
  const isGuest = useSessionStore((s) => s.user?.isGuest ?? false);
  const { profile, profiles, isLoading, isError, refetch } = useActiveProfile();
  const [date, setDate] = useState(dhakaDate());

  const header = (
    <View className="flex-row items-center justify-between px-5 pb-2 pt-2">
      <BanglaText variant="title">ওষুধ</BanglaText>
      {profile && canEdit(profile) ? (
        <IconButton
          icon={Plus}
          label="ওষুধ যোগ করুন"
          tone="primary"
          onPress={() => router.push('/plans/new')}
        />
      ) : null}
    </View>
  );

  if (isGuest) {
    return (
      <ScrollScreen inTabs header={header}>
        <GuestNotice what="ওষুধের অ্যালার্ম আর সেবনের হিসাব" />
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen inTabs header={header} onRefresh={() => Promise.resolve(refetch())}>
      {isLoading ? (
        <LoadingList rows={3} rowClassName="h-28" />
      ) : isError ? (
        <ErrorState error={null} onRetry={() => void refetch()} />
      ) : !profile ? (
        <CreateOwnProfileCard />
      ) : (
        <>
          <ActiveProfileChip profile={profile} count={profiles.length} />
          <AlarmReliabilityCard />
          <DateStrip value={date} onChange={setDate} />
          <AdherenceCard profileId={profile.id} />
          <View className="gap-3">
            <SectionHeader title={doseHeading(date)} />
            <DoseList profile={profile} date={date} />
          </View>
          <PlansList profile={profile} />
        </>
      )}
    </ScrollScreen>
  );
}
