import { router } from 'expo-router';
import {
  CircleAlert,
  HeartPulse,
  MailOpen,
  Pill,
  Siren,
} from 'lucide-react-native';
import { Pressable, ScrollView, View } from 'react-native';

import { CreateOwnProfileCard, GuestNotice } from '@/components/app/account-gates';
import { HealthTipCard } from '@/components/content/health-tip-card';
import { ProviderHomeCard } from '@/components/provider/provider-home-card';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { IconBadge } from '@/components/ui/icon-badge';
import { ProgressRing } from '@/components/ui/progress-ring';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { SectionHeader } from '@/components/ui/list-row';
import { AppointmentCard } from '@/components/doctors/appointment-card';
import { useNextAppointment } from '@/features/doctors/use-doctors';
import { useLatestHealthTips } from '@/features/content/use-health-tips';
import { useActiveEmergency } from '@/features/emergency/use-emergency';
import { ErrorState, LoadingList, SkeletonBlock } from '@/components/ui/state-views';
import { StatusPill } from '@/components/ui/status-pill';
import { SurfaceCard } from '@/components/ui/surface-card';
import { VITAL_META, VITAL_STATUS_META, formatVitalValue } from '@/features/health/health-display';
import { useLatestVitals } from '@/features/health/use-health';
import { doseText } from '@/features/medicine/medicine-display';
import { useDaySchedule, usePlans, useRecordDose } from '@/features/medicine/use-medicine';
import { useUnreadCount } from '@/features/notifications/use-notifications';
import { useShopEnabled } from '@/features/shop/use-shop';
import { useAddToCart } from '@/features/shop/use-add-to-cart';
import {
  CommonConcerns,
  HomeHeader,
  OtherServices,
  ServiceCards,
  ShopHomeStrip,
  TipsCarousel,
  TopDoctors,
  TrustRow,
} from '@/components/home/home-sections';
import { canEdit } from '@/features/profiles/profile-permissions';
import { useActiveProfile, useMyInvites } from '@/features/profiles/use-profiles';
import { toBanglaDigits } from '@/lib/bangla-digits';
import {
  banglaClock,
  dayPeriod,
  dhakaDate,
  dhakaTime,
  formatDate,
  BANGLA_WEEKDAYS,
  weekdayOf,
} from '@/lib/bangla-format';
import { showToast } from '@/lib/user-feedback';
import type { PatientProfileResponse } from '@/shared-contracts/profiles.contract';
import { useSessionStore } from '@/stores/session-store';
import { colors } from '@/theme/design-tokens';

function greeting(): string {
  const hour = Number(dhakaTime(new Date()).slice(0, 2));
  const period = dayPeriod(hour);
  return period === 'রাত' ? 'শুভ রাত্রি' : `শুভ ${period}`;
}

function TodayMedicineCard({ profile }: { profile: PatientProfileResponse }) {
  const day = useDaySchedule(profile.id);
  const record = useRecordDose(profile.id);
  const editable = canEdit(profile);

  if (day.isLoading) return <SkeletonBlock className="h-44" />;
  if (day.isError) return <ErrorState error={day.error} onRetry={() => void day.refetch()} />;
  const schedule = day.data!;

  if (schedule.summary.total === 0) {
    return (
      <SurfaceCard className="gap-4">
        <View className="flex-row items-center gap-3">
          <IconBadge icon={Pill} />
          <View className="flex-1">
            <BanglaText variant="body-strong">আজ কোনো ওষুধ নেই</BanglaText>
            <BanglaText variant="caption">
              ওষুধ যোগ করলে সময়মতো অ্যালার্ম বাজবে, ইন্টারনেট না থাকলেও।
            </BanglaText>
          </View>
        </View>
        {editable ? (
          <ActionButton
            label="ওষুধ যোগ করুন"
            variant="secondary"
            size="sm"
            onPress={() => router.push('/plans/new')}
          />
        ) : null}
      </SurfaceCard>
    );
  }

  const { taken, total } = schedule.summary;
  const next =
    schedule.doses.find((d) => d.state === 'DUE') ??
    schedule.doses.find((d) => d.state === 'SNOOZED') ??
    schedule.doses.find((d) => d.state === 'UPCOMING');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="আজকের ওষুধ"
      onPress={() => router.push('/medicine')}
      className="gap-4 overflow-hidden rounded-3xl bg-primary p-5 active:opacity-95">
      <View
        pointerEvents="none"
        className="absolute -right-12 -top-14 h-44 w-44 rounded-full bg-primary-500/70"
      />
      <View className="flex-row items-center gap-4">
        <ProgressRing
          progress={total ? taken / total : 0}
          color={colors.white}
          trackColor="rgba(255,255,255,0.22)">
          <BanglaText className="font-bangla-bold text-[18px] leading-[24px] text-white">
            {toBanglaDigits(taken)}/{toBanglaDigits(total)}
          </BanglaText>
        </ProgressRing>
        <View className="flex-1 gap-1">
          <BanglaText variant="heading" className="text-white">
            আজকের ওষুধ
          </BanglaText>
          <BanglaText variant="label" className="font-bangla text-primary-100">
            {taken === total
              ? 'আজকের সব ওষুধ নেওয়া হয়েছে। খুব ভালো!'
              : `${toBanglaDigits(total)}টির মধ্যে ${toBanglaDigits(taken)}টি নেওয়া হয়েছে`}
          </BanglaText>
        </View>
      </View>
      {next ? (
        <View
          className="gap-3 rounded-2xl p-3.5"
          style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
          <View className="flex-row items-center justify-between gap-2">
            <View className="flex-1">
              <BanglaText variant="caption" className="text-primary-100">
                {next.state === 'DUE' ? 'এখন খাওয়ার সময়' : `পরের ডোজ · ${banglaClock(next.time)}`}
              </BanglaText>
              <BanglaText variant="body-strong" className="text-white" numberOfLines={1}>
                {next.displayName} · {doseText(next.dose, next.doseUnit)}
              </BanglaText>
            </View>
          </View>
          {editable ? (
            <ActionButton
              label="সেবন করেছি"
              variant="secondary"
              size="sm"
              loading={record.isPending}
              onPress={() =>
                record.mutate(
                  { planId: next.planId, scheduledFor: next.scheduledFor, status: 'TAKEN' },
                  {
                    onSuccess: ({ queued }) =>
                      showToast(
                        queued ? 'রাখা হলো। নেট এলে পাঠানো হবে।' : 'সেবন করা হিসেবে রাখা হলো'
                      ),
                  }
                )
              }
            />
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

/** আকস্মিক সেবা: always one tap away; shows the live request when there is one. */
function EmergencyButton({ profileId }: { profileId?: string }) {
  const active = useActiveEmergency(profileId);
  const live = active.data;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="আকস্মিক সেবা"
      onPress={() => router.push('/emergency')}
      className="min-h-[64px] flex-row items-center gap-3 rounded-3xl bg-danger px-4 py-3 active:opacity-90">
      <View className="h-11 w-11 items-center justify-center rounded-2xl bg-white/20">
        <Siren size={24} color={colors.white} />
      </View>
      <View className="flex-1">
        <BanglaText className="font-bangla-bold text-[18px] leading-[28px] text-white">আকস্মিক সেবা</BanglaText>
        <BanglaText variant="caption" className="text-white/90">
          {live
            ? `${live.code} · ${live.status === 'DISPATCHED' ? 'সাহায্য আসছে' : 'সাহায্যের অপেক্ষায়'}`
            : 'অ্যাম্বুলেন্স, ডাক্তার বা জরুরি সাহায্য'}
        </BanglaText>
      </View>
    </Pressable>
  );
}

/** The newest health tips (hidden when there are none). */
function HealthTipsStrip() {
  const tips = useLatestHealthTips();
  const list = tips.data ?? [];
  if (list.length === 0) return null;
  return (
    <View className="gap-3">
      <SectionHeader title="স্বাস্থ্য টিপস" actionLabel="সব দেখুন" onAction={() => router.push('/tips')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 pr-5">
        {list.map((tip) => (
          <HealthTipCard key={tip.id} tip={tip} compact />
        ))}
      </ScrollView>
    </View>
  );
}

/** The soonest booking (hidden when there is none). */
function NextAppointmentCard({ profileId }: { profileId: string }) {
  const next = useNextAppointment(profileId);
  const a = next.data;
  if (!a) return null;
  return (
    <View className="gap-3">
      <SectionHeader
        title="পরবর্তী অ্যাপয়েন্টমেন্ট"
        actionLabel="সব দেখুন"
        onAction={() => router.push('/appointments')}
      />
      <AppointmentCard
        appointment={a}
        onPress={() =>
          router.push({ pathname: '/appointments/[appointmentId]', params: { appointmentId: a.id } })
        }
      />
    </View>
  );
}

function LowStockAlerts({ profileId }: { profileId: string }) {
  const plans = usePlans(profileId);
  const low = (plans.data ?? []).filter((plan) => plan.isActive && plan.lowStock);
  if (low.length === 0) return null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/plans/[planId]', params: { planId: low[0]!.id } })}
      className="flex-row items-center gap-3 rounded-3xl border border-warning/25 bg-warning-soft p-4 active:opacity-80">
      <CircleAlert size={22} color={colors.warning} />
      <View className="flex-1">
        <BanglaText variant="body-strong" className="text-warning">
          ওষুধ ফুরিয়ে আসছে
        </BanglaText>
        <BanglaText variant="caption" className="text-ink">
          {low
            .map((plan) =>
              plan.stockDaysLeft && plan.stockDaysLeft > 0
                ? `${plan.displayName} (${toBanglaDigits(plan.stockDaysLeft)} দিন)`
                : `${plan.displayName} (আজই শেষ)`
            )
            .join(', ')}
        </BanglaText>
      </View>
    </Pressable>
  );
}

function LatestVitalsStrip({ profileId }: { profileId: string }) {
  const latest = useLatestVitals(profileId);
  const readings = latest.data ?? [];
  if (latest.isLoading) return <SkeletonBlock className="h-24" />;
  if (readings.length === 0) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/vitals/new')}
        className="flex-row items-center gap-3 rounded-3xl border border-dashed border-line-strong bg-surface-card/60 p-4 active:bg-primary-50">
        <IconBadge icon={HeartPulse} size="sm" />
        <BanglaText variant="label" className="flex-1 font-bangla text-ink-muted">
          রক্তচাপ, শর্করা বা ওজন মেপে লিখে রাখুন। সময়ের সাথে পরিবর্তন দেখতে পারবেন।
        </BanglaText>
      </Pressable>
    );
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-3 pr-5">
      {readings.map((reading) => {
        const meta = VITAL_META[reading.type];
        const status = reading.status ? VITAL_STATUS_META[reading.status] : null;
        return (
          <Pressable
            key={reading.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/vitals', params: { type: reading.type } })}
            className="w-[148px] gap-2 rounded-3xl border border-line/70 bg-surface-card p-4 active:bg-primary-50">
            <BanglaText variant="caption">{meta.shortLabel}</BanglaText>
            <View>
              <BanglaText className="font-bangla-bold text-[22px] leading-[30px]">
                {formatVitalValue(reading)}
              </BanglaText>
              <BanglaText variant="caption">{meta.unit}</BanglaText>
            </View>
            {status ? <StatusPill label={status.label} tone={status.tone} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function HomeScreen() {
  const user = useSessionStore((s) => s.user);
  const isGuest = user?.isGuest ?? false;
  const { profile, profiles, isLoading, isError, refetch } = useActiveProfile();
  const unread = useUnreadCount();
  const invites = useMyInvites();
  const today = dhakaDate();
  const shopEnabled = useShopEnabled();
  const cart = useAddToCart();
  const firstName = profile?.fullName.split(' ')[0];

  const header = (
    <HomeHeader
      profile={isGuest ? null : profile}
      isGuest={isGuest}
      unread={unread.data ?? 0}
      cartCount={cart.itemCount}
      shopEnabled={shopEnabled}
    />
  );

  const welcome = (
    <View>
      <BanglaText variant="heading">
        {greeting()}
        {firstName ? `, ${firstName}` : ''}!
      </BanglaText>
      <BanglaText variant="caption">
        {BANGLA_WEEKDAYS[weekdayOf(today)]}, {formatDate(today)}
      </BanglaText>
    </View>
  );

  // Browsing parts everyone sees (guests too): offers, specialties, doctors, shop.
  const discover = (
    <>
      <TipsCarousel />
      <CommonConcerns />
      <TopDoctors />
      {shopEnabled ? <ShopHomeStrip /> : null}
    </>
  );

  if (isGuest) {
    return (
      <ScrollScreen inTabs header={header} onRefresh={async () => refetch()}>
        {welcome}
        <ServiceCards shopEnabled={shopEnabled} signedUp={false} />
        <EmergencyButton />
        <GuestNotice what="নিজের ও পরিবারের স্বাস্থ্য তথ্য, রিপোর্ট আর ওষুধের অ্যালার্ম" />
        {discover}
        <HealthTipsStrip />
        <TrustRow />
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen
      inTabs
      header={header}
      onRefresh={() => Promise.all([refetch(), unread.refetch(), invites.refetch()])}>
      {(invites.data ?? []).length > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/invitations')}
          className="flex-row items-center gap-3 rounded-3xl border border-primary-200 bg-primary-50 p-4 active:opacity-80">
          <IconBadge icon={MailOpen} size="sm" />
          <View className="flex-1">
            <BanglaText variant="body-strong">পরিবারের আমন্ত্রণ এসেছে</BanglaText>
            <BanglaText variant="caption">
              {invites.data![0]!.profileName}-এর প্রোফাইলে যোগ দিতে আমন্ত্রণ
              {invites.data!.length > 1
                ? ` এবং আরও ${toBanglaDigits(invites.data!.length - 1)}টি`
                : ''}
            </BanglaText>
          </View>
        </Pressable>
      ) : null}

      {welcome}

      {isLoading ? (
        <LoadingList rows={2} rowClassName="h-40" />
      ) : isError ? (
        <ErrorState error={null} onRetry={() => void refetch()} />
      ) : !profile ? (
        <>
          <ProviderHomeCard />
          <CreateOwnProfileCard />
          <ServiceCards shopEnabled={shopEnabled} signedUp={false} />
          <EmergencyButton />
          {discover}
          <HealthTipsStrip />
          <TrustRow />
        </>
      ) : (
        <>
          <ProviderHomeCard />
          <ServiceCards shopEnabled={shopEnabled} signedUp />
          <EmergencyButton profileId={profile.id} />
          <TodayMedicineCard profile={profile} />
          <NextAppointmentCard profileId={profile.id} />
          <LowStockAlerts profileId={profile.id} />
          <OtherServices profile={profile} shopEnabled={shopEnabled} />
          {discover}
          <View className="gap-3">
            <SectionHeader
              title={profiles.length > 1 ? `সবশেষ মাপ · ${profile.fullName}` : 'সবশেষ মাপ'}
              actionLabel="সব দেখুন"
              onAction={() => router.push('/vitals')}
            />
            <LatestVitalsStrip profileId={profile.id} />
          </View>
          <HealthTipsStrip />
          <TrustRow />
        </>
      )}
    </ScrollScreen>
  );
}
