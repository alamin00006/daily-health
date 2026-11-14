import { router, useLocalSearchParams } from 'expo-router';
import {
  BadgeCheck,
  Building2,
  CalendarPlus,
  Heart,
  MapPin,
  Star,
} from 'lucide-react-native';
import { View } from 'react-native';

import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { IconButton, ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { ErrorState, SkeletonBlock } from '@/components/ui/state-views';
import { SurfaceCard } from '@/components/ui/surface-card';
import {
  MODE_ICON,
  MODE_LABEL,
  providerTitle,
  ratingText,
  taka,
} from '@/features/doctors/doctor-display';
import { useFavorites, useProvider, useToggleFavorite } from '@/features/doctors/use-doctors';
import { canEdit } from '@/features/profiles/profile-permissions';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { apiErrorMessage } from '@/api/api-error-messages';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { banglaClock, BANGLA_WEEKDAYS_SHORT, timeAgo } from '@/lib/bangla-format';
import { showToast } from '@/lib/user-feedback';
import type { ConsultationMode, ScheduleResponse } from '@/shared-contracts/doctors.contract';
import { colors } from '@/theme/design-tokens';

/** Saturday first: the Bangladeshi week. */
const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];

/** "শনি, সোম, বুধ · বিকেল ৫:০০–রাত ৯:০০", grouping days with the same hours. */
function scheduleLines(schedules: ScheduleResponse[]): string[] {
  const byHours = new Map<string, number[]>();
  for (const s of schedules) {
    const key = `${s.startTime}-${s.endTime}`;
    byHours.set(key, [...(byHours.get(key) ?? []), s.dayOfWeek]);
  }
  return [...byHours.entries()].map(([hours, days]) => {
    const [start, end] = hours.split('-') as [string, string];
    const sorted = WEEK_ORDER.filter((d) => days.includes(d));
    const dayText =
      sorted.length === 7 ? 'প্রতিদিন' : sorted.map((d) => BANGLA_WEEKDAYS_SHORT[d]).join(', ');
    return `${dayText} · ${banglaClock(start)}–${banglaClock(end)}`;
  });
}

export default function ProviderScreen() {
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  const provider = useProvider(providerId);
  const { profile } = useActiveProfile();
  const favorites = useFavorites(profile?.id);
  const toggle = useToggleFavorite(profile?.id ?? '');
  const p = provider.data;
  const isFavorite = Boolean(favorites.data?.some((f) => f.provider.id === providerId));
  const rating = p ? ratingText(p.ratingAvg, p.ratingCount) : null;

  const onlineModes = (['VIDEO', 'CHAT', 'HOME_VISIT'] as const).filter((m) =>
    p?.modes.includes(m)
  );
  const onlineFee = (mode: Exclude<ConsultationMode, 'IN_PERSON'>) =>
    mode === 'VIDEO' ? p?.fees.video : mode === 'CHAT' ? p?.fees.chat : p?.fees.homeVisit;

  return (
    <ScrollScreen
      header={
        <ScreenHeader
          title={p ? providerTitle(p.type, p.displayName) : 'ডাক্তার'}
          fallbackHref="/doctors"
          actions={
            p && profile && canEdit(profile) ? (
              <IconButton
                icon={Heart}
                tone={isFavorite ? 'danger' : 'default'}
                label={isFavorite ? 'আমার ডাক্তার থেকে সরান' : 'আমার ডাক্তারে রাখুন'}
                onPress={() =>
                  toggle.mutate(
                    { providerId: p.id, favorite: !isFavorite },
                    {
                      onSuccess: () =>
                        showToast(isFavorite ? 'তালিকা থেকে সরানো হয়েছে' : '"আমার ডাক্তার"-এ রাখা হয়েছে'),
                      onError: (e) => showToast(apiErrorMessage(e)),
                    }
                  )
                }
              />
            ) : undefined
          }
        />
      }
      onRefresh={() => provider.refetch()}
      footer={
        p && p.modes.length > 0 ? (
          <ActionButton
            label="অ্যাপয়েন্টমেন্ট নিন"
            icon={CalendarPlus}
            onPress={() =>
              router.push({ pathname: '/doctors/[providerId]/book', params: { providerId: p.id } })
            }
          />
        ) : undefined
      }>
      {provider.isLoading ? (
        <>
          <SkeletonBlock className="h-48" />
          <SkeletonBlock className="h-32" />
        </>
      ) : provider.isError || !p ? (
        <ErrorState error={provider.error} onRetry={() => void provider.refetch()} />
      ) : (
        <>
          <SurfaceCard className="items-center gap-2 py-6">
            <View>
              <ProfileAvatar name={p.displayName} photoUrl={p.avatarUrl} size="lg" />
              {p.isOnline ? (
                <View className="absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-white bg-success" />
              ) : null}
            </View>
            <View className="mt-1 flex-row items-center">
              <BanglaText variant="heading" className="text-center">
                {providerTitle(p.type, p.displayName)}
              </BanglaText>
              <BadgeCheck size={18} color={colors.primary} style={{ marginLeft: 6 }} />
            </View>
            {p.designation ? (
              <BanglaText variant="caption" className="text-center">
                {p.designation}
              </BanglaText>
            ) : null}
            <BanglaText variant="label" className="text-center text-ink-muted">
              {p.qualifications}
            </BanglaText>
            {p.bmdcNo ? (
              <View className="rounded-full bg-primary-50 px-3 py-1">
                <BanglaText className="font-bangla-semibold text-[13px] leading-[20px] text-primary-700">
                  BMDC নিবন্ধন: {p.bmdcNo}
                </BanglaText>
              </View>
            ) : null}
            <View className="mt-2 w-full flex-row border-t border-line/60 pt-4">
              <View className="flex-1 items-center">
                <View className="flex-row items-center">
                  <Star size={16} color="#e0a100" fill="#e0a100" />
                  <BanglaText variant="body-strong" className="ml-1">
                    {rating ?? 'নতুন'}
                  </BanglaText>
                </View>
                <BanglaText variant="caption">
                  {p.ratingCount ? `${toBanglaDigits(p.ratingCount)} জনের মত` : 'রিভিউ নেই'}
                </BanglaText>
              </View>
              <View className="flex-1 items-center border-x border-line/60">
                <BanglaText variant="body-strong">{toBanglaDigits(p.experienceYears)} বছর</BanglaText>
                <BanglaText variant="caption">অভিজ্ঞতা</BanglaText>
              </View>
              <View className="flex-1 items-center">
                <BanglaText variant="body-strong" className={p.isOnline ? 'text-success' : 'text-ink-muted'}>
                  {p.isOnline ? 'অনলাইনে' : 'অফলাইন'}
                </BanglaText>
                <BanglaText variant="caption">এখন</BanglaText>
              </View>
            </View>
          </SurfaceCard>

          <View className="flex-row flex-wrap gap-2">
            {p.specialties.map((s) => (
              <View key={s.id} className="rounded-full bg-primary-100 px-3 py-1.5">
                <BanglaText className="font-bangla-medium text-[13px] leading-[20px] text-primary-700">
                  {s.nameBn}
                </BanglaText>
              </View>
            ))}
          </View>

          {p.chambers.map((chamber) => {
            const sessions = p.schedules.filter((s) => s.chamberId === chamber.id);
            return (
              <SurfaceCard key={chamber.id} className="gap-3">
                <View className="flex-row items-start gap-3">
                  <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary-100">
                    <Building2 size={20} color={colors.primary} />
                  </View>
                  <View className="flex-1">
                    <BanglaText variant="body-strong">{chamber.hospital.name}</BanglaText>
                    <View className="flex-row items-start">
                      <MapPin size={14} color={colors.inkMuted} style={{ marginTop: 3 }} />
                      <BanglaText variant="caption" className="ml-1 flex-1">
                        {chamber.hospital.address}, {chamber.hospital.district}
                        {chamber.room ? ` · ${chamber.room}` : ''}
                      </BanglaText>
                    </View>
                  </View>
                  <View className="items-end">
                    <BanglaText className="font-bangla-bold text-[17px] leading-[26px] text-primary">
                      {taka(chamber.fee)}
                    </BanglaText>
                    {chamber.followUpFee !== null ? (
                      <BanglaText variant="caption">ফলো-আপ {taka(chamber.followUpFee)}</BanglaText>
                    ) : null}
                  </View>
                </View>
                {scheduleLines(sessions).map((line) => (
                  <BanglaText key={line} variant="label" className="rounded-xl bg-surface px-3 py-2">
                    {line}
                  </BanglaText>
                ))}
              </SurfaceCard>
            );
          })}

          {onlineModes.length > 0 ? (
            <SurfaceCard className="gap-3">
              <BanglaText variant="body-strong">অনলাইন ও বাসায় সেবা</BanglaText>
              {onlineModes.map((mode) => {
                const Icon = MODE_ICON[mode];
                const fee = onlineFee(mode);
                return (
                  <View key={mode} className="gap-1.5 border-t border-line/60 pt-3">
                    <View className="flex-row items-center">
                      <Icon size={18} color={colors.primary} />
                      <BanglaText variant="label" className="ml-2 flex-1">
                        {MODE_LABEL[mode]}
                      </BanglaText>
                      {fee != null ? (
                        <BanglaText className="font-bangla-bold text-[16px] leading-[24px] text-primary">
                          {taka(fee)}
                        </BanglaText>
                      ) : null}
                    </View>
                    {scheduleLines(p.schedules.filter((s) => s.mode === mode)).map((line) => (
                      <BanglaText key={line} variant="caption">
                        {line}
                      </BanglaText>
                    ))}
                  </View>
                );
              })}
            </SurfaceCard>
          ) : null}

          {p.bio ? (
            <SurfaceCard className="gap-2">
              <BanglaText variant="body-strong">পরিচিতি</BanglaText>
              <BanglaText>{p.bio}</BanglaText>
            </SurfaceCard>
          ) : null}

          {p.latestReviews.length > 0 ? (
            <SurfaceCard className="gap-3">
              <BanglaText variant="body-strong">রোগীদের মতামত</BanglaText>
              {p.latestReviews.map((review) => (
                <View key={review.id} className="gap-1 border-t border-line/60 pt-3">
                  <View className="flex-row items-center">
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star
                        key={i}
                        size={13}
                        color="#e0a100"
                        fill={i < review.rating ? '#e0a100' : 'transparent'}
                      />
                    ))}
                    <BanglaText variant="caption" className="ml-2">
                      {review.authorLabel} · {timeAgo(review.createdAt)}
                    </BanglaText>
                  </View>
                  {review.comment ? <BanglaText>{review.comment}</BanglaText> : null}
                </View>
              ))}
            </SurfaceCard>
          ) : null}

          <BanglaText variant="caption" className="text-center">
            আইডি {p.providerCode} · দৈনিক স্বাস্থ্য যাচাই করেছে
          </BanglaText>
        </>
      )}
    </ScrollScreen>
  );
}
