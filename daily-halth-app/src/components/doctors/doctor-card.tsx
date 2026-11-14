import { BadgeCheck, Star } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { BanglaText } from '@/components/ui/bangla-text';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import {
  MODE_ICON,
  MODE_LABEL,
  providerTitle,
  ratingText,
  taka,
} from '@/features/doctors/doctor-display';
import { toBanglaDigits } from '@/lib/bangla-digits';
import type { ProviderSummaryResponse } from '@/shared-contracts/doctors.contract';
import { colors, shadows } from '@/theme/design-tokens';

/** The lowest fee among the modes on offer, for "৳৫০০ থেকে". */
function lowestFee(provider: ProviderSummaryResponse): number | null {
  const fees = [
    provider.fees.inPersonFrom,
    provider.fees.video,
    provider.fees.chat,
    provider.fees.homeVisit,
  ].filter((fee): fee is number => fee !== null);
  return fees.length ? Math.min(...fees) : null;
}

/** A provider in search results and "my doctors". */
export function DoctorCard({
  provider,
  onPress,
}: {
  provider: ProviderSummaryResponse;
  onPress: () => void;
}) {
  const rating = ratingText(provider.ratingAvg, provider.ratingCount);
  const fee = lowestFee(provider);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={providerTitle(provider.type, provider.displayName)}
      onPress={onPress}
      style={shadows.card}
      className="rounded-3xl bg-surface-card p-4 active:opacity-90">
      <View className="flex-row gap-3.5">
        <View className="self-start">
          <ProfileAvatar
            name={provider.displayName}
            photoUrl={provider.avatarThumbnailUrl}
            size="lg"
          />
          {provider.isOnline ? (
            <View className="absolute bottom-0.5 right-0.5 h-4 w-4 rounded-full border-2 border-white bg-success" />
          ) : null}
        </View>
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center gap-1.5">
            <BanglaText variant="body-strong" numberOfLines={1} className="flex-shrink">
              {providerTitle(provider.type, provider.displayName)}
            </BanglaText>
            <BadgeCheck size={16} color={colors.primary} />
          </View>
          <BanglaText variant="caption" numberOfLines={1}>
            {provider.specialties.map((s) => s.nameBn).join(', ')}
          </BanglaText>
          <BanglaText variant="caption" numberOfLines={1} className="text-ink-subtle">
            {provider.qualifications}
          </BanglaText>
          <View className="mt-1 flex-row flex-wrap items-center gap-x-3 gap-y-1">
            {rating ? (
              <View className="flex-row items-center">
                <Star size={14} color="#e0a100" fill="#e0a100" />
                <BanglaText className="ml-1 font-bangla-semibold text-[13px] leading-[20px]">
                  {rating}
                </BanglaText>
                <BanglaText variant="caption" className="ml-0.5">
                  ({toBanglaDigits(provider.ratingCount)})
                </BanglaText>
              </View>
            ) : (
              <BanglaText variant="caption">নতুন</BanglaText>
            )}
            <BanglaText variant="caption">
              {toBanglaDigits(provider.experienceYears)} বছরের অভিজ্ঞতা
            </BanglaText>
          </View>
        </View>
      </View>
      <View className="mt-3 flex-row items-center justify-between border-t border-line/60 pt-3">
        <View className="flex-row flex-wrap gap-1.5">
          {provider.modes.map((mode) => {
            const Icon = MODE_ICON[mode];
            return (
              <View
                key={mode}
                className="flex-row items-center rounded-full bg-primary-50 px-2.5 py-1">
                <Icon size={13} color={colors.primary} />
                <BanglaText className="ml-1 text-[12px] leading-[17px] text-primary-700">
                  {MODE_LABEL[mode]}
                </BanglaText>
              </View>
            );
          })}
        </View>
        {fee !== null ? (
          <BanglaText className="font-bangla-semibold text-[15px] leading-[22px] text-primary">
            {taka(fee)} থেকে
          </BanglaText>
        ) : null}
      </View>
    </Pressable>
  );
}
