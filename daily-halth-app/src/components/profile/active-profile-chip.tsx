import { router } from 'expo-router';
import { ChevronDown } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { BanglaText } from '@/components/ui/bangla-text';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { relationLabel } from '@/features/profiles/profile-permissions';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import type { PatientProfileResponse } from '@/shared-contracts/profiles.contract';
import { colors } from '@/theme/design-tokens';

/**
 * "Whose health am I looking at?" One tap opens the family list, so a
 * daughter can switch to her father's profile from any tab.
 */
export function ActiveProfileChip({
  profile,
  count,
}: {
  profile: PatientProfileResponse;
  /** How many profiles the user has (the switcher also adds new ones). */
  count: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${profile.fullName}-এর তথ্য দেখছেন। বদলাতে চাপুন`}
      onPress={() => router.push('/profile-switcher')}
      className="flex-row items-center gap-2.5 self-start rounded-full border border-line bg-surface-card py-1.5 pl-1.5 pr-3 active:bg-primary-50">
      <ProfileAvatar name={profile.fullName} photoUrl={profile.avatarThumbnailUrl} size="sm" />
      <View>
        <BanglaText variant="label" className="font-bangla-semibold" numberOfLines={1}>
          {profile.fullName}
        </BanglaText>
        <BanglaText variant="caption" className="text-[12px] leading-[16px]">
          {relationLabel(profile)}
          {count > 1 ? ' · বদলান' : ''}
        </BanglaText>
      </View>
      <ChevronDown size={18} color={colors.inkMuted} strokeWidth={2} />
    </Pressable>
  );
}

/** The chip for the active profile; nothing for guests or before profiles load. */
export function CurrentProfileChip() {
  const { profile, profiles } = useActiveProfile();
  if (!profile) return null;
  return <ActiveProfileChip profile={profile} count={profiles.length} />;
}
