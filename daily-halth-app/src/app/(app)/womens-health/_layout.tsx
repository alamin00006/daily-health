import { Stack, router } from 'expo-router';
import { HeartHandshake } from 'lucide-react-native';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { WomensHealthLockGate } from '@/components/womens-health/womens-health-lock-gate';
import { ScreenHeader } from '@/components/ui/screen-header';
import { EmptyState, ErrorState, LoadingList } from '@/components/ui/state-views';
import { canViewWomensHealth } from '@/features/profiles/profile-permissions';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { useCycleOverview } from '@/features/womens-health/use-womens-health';
import { colors } from '@/theme/design-tokens';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-surface">
      <ScreenHeader title="নারীস্বাস্থ্য" fallbackHref="/home" />
      <View className="flex-1 px-5 pt-2">{children}</View>
    </SafeAreaView>
  );
}

/**
 * Every women's health screen sits behind this: the selected profile must be
 * one whose data the user may see (the patient themself, or the OWNER when the
 * patient has no account), and the on-device lock must be open.
 */
export default function WomensHealthLayout() {
  const { profile, isLoading } = useActiveProfile();
  const allowed = canViewWomensHealth(profile);
  const overview = useCycleOverview(profile?.id, allowed);

  if (isLoading || (allowed && overview.isLoading)) {
    return (
      <Shell>
        <LoadingList rows={2} rowClassName="h-56" />
      </Shell>
    );
  }
  if (!profile || !allowed) {
    return (
      <Shell>
        <EmptyState
          icon={HeartHandshake}
          title="এই প্রোফাইলে নারীস্বাস্থ্য দেখা যাবে না"
          message="পিরিয়ড ও গর্ভধারণের তথ্য শুধু রোগী নিজে দেখতে পারেন। রোগীর নিজের অ্যাকাউন্ট না থাকলে প্রোফাইলের মালিক দেখতে পারেন।"
          actionLabel="প্রোফাইল বদলান"
          onAction={() => router.push('/profile-switcher')}
        />
      </Shell>
    );
  }
  if (!overview.data) {
    return (
      <Shell>
        <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
      </Shell>
    );
  }

  return (
    <WomensHealthLockGate profileId={profile.id} enabled={overview.data.settings.appLockEnabled}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.surface },
        }}
      />
    </WomensHealthLockGate>
  );
}
