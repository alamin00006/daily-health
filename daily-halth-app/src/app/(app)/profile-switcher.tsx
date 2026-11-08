import { router } from 'expo-router';
import { Check, Plus } from 'lucide-react-native';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BanglaText } from '@/components/ui/bangla-text';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { StatusPill } from '@/components/ui/status-pill';
import { relationLabel, ROLE_LABELS } from '@/features/profiles/profile-permissions';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { useActiveProfileStore } from '@/stores/active-profile-store';
import { colors, shadows } from '@/theme/design-tokens';

/** Bottom sheet: whose health to look at, or add a family member. */
export default function ProfileSwitcherSheet() {
  const insets = useSafeAreaInsets();
  const { profile: active, profiles } = useActiveProfile();
  const setActive = useActiveProfileStore((s) => s.setActiveProfile);

  return (
    <View className="flex-1 justify-end">
      <Pressable
        accessibilityLabel="বন্ধ করুন"
        className="absolute inset-0 bg-black/35"
        onPress={() => router.back()}
      />
      <View
        style={[shadows.raised, { paddingBottom: Math.max(insets.bottom, 16) }]}
        className="max-h-[80%] gap-4 rounded-t-4xl bg-surface-card px-5 pt-3">
        <View className="h-1.5 w-12 self-center rounded-full bg-line" />
        <BanglaText variant="heading">কার তথ্য দেখবেন?</BanglaText>
        <ScrollView contentContainerClassName="gap-2" showsVerticalScrollIndicator={false}>
          {profiles.map((profile) => {
            const selected = profile.id === active?.id;
            return (
              <Pressable
                key={profile.id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${profile.fullName}, ${relationLabel(profile)}`}
                onPress={() => {
                  setActive(profile.id);
                  router.back();
                }}
                className={`flex-row items-center gap-3 rounded-2xl border p-3 ${
                  selected ? 'border-primary bg-primary-50' : 'border-line/70 active:bg-primary-50'
                }`}>
                <ProfileAvatar
                  name={profile.fullName}
                  photoUrl={profile.avatarThumbnailUrl}
                  size="md"
                />
                <View className="flex-1 gap-0.5">
                  <BanglaText variant="body-strong" numberOfLines={1}>
                    {profile.fullName}
                  </BanglaText>
                  <View className="flex-row gap-1.5">
                    <StatusPill label={relationLabel(profile)} tone="info" />
                    {profile.myRelation !== 'SELF' ? (
                      <StatusPill label={ROLE_LABELS[profile.myRole]} tone="neutral" />
                    ) : null}
                  </View>
                </View>
                {selected ? <Check size={22} color={colors.primary} strokeWidth={2.5} /> : null}
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              router.back();
              router.push('/profiles/new');
            }}
            className="flex-row items-center gap-3 rounded-2xl border border-dashed border-primary-300 p-3 active:bg-primary-50">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-primary-50">
              <Plus size={22} color={colors.primary} />
            </View>
            <View className="flex-1">
              <BanglaText variant="body-strong" className="text-primary">
                পরিবারের সদস্য যোগ করুন
              </BanglaText>
              <BanglaText variant="caption">বাবা, মা, সন্তান বা অন্য কারো প্রোফাইল</BanglaText>
            </View>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}
