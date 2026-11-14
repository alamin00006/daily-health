import { router } from 'expo-router';
import { Search, Stethoscope } from 'lucide-react-native';
import { View } from 'react-native';

import { DoctorCard } from '@/components/doctors/doctor-card';
import { ActionButton } from '@/components/ui/action-button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { EmptyState, ErrorState, LoadingList } from '@/components/ui/state-views';
import { useFavorites } from '@/features/doctors/use-doctors';
import { useActiveProfile } from '@/features/profiles/use-profiles';

/** The profile's doctors: saved with the heart, and added after each completed visit. */
export default function MyDoctorsScreen() {
  const { profile } = useActiveProfile();
  const favorites = useFavorites(profile?.id);

  return (
    <ScrollScreen
      header={<ScreenHeader title="আমার ডাক্তার" subtitle={profile?.fullName} fallbackHref="/health" />}
      onRefresh={() => favorites.refetch()}
      footer={<ActionButton label="ডাক্তার খুঁজুন" icon={Search} variant="secondary" onPress={() => router.push('/doctors')} />}>
      {favorites.isLoading ? (
        <LoadingList rows={3} rowClassName="h-36" />
      ) : favorites.isError ? (
        <ErrorState error={favorites.error} onRetry={() => void favorites.refetch()} />
      ) : !favorites.data?.length ? (
        <EmptyState
          icon={Stethoscope}
          title="এখনো কেউ নেই"
          message="ডাক্তারের পাতায় ♥ চাপলে, বা অ্যাপে ডাক্তার দেখানোর পর তিনি এখানে চলে আসবেন।"
        />
      ) : (
        <View className="gap-3">
          {favorites.data.map(({ provider }) => (
            <DoctorCard
              key={provider.id}
              provider={provider}
              onPress={() => router.push({ pathname: '/doctors/[providerId]', params: { providerId: provider.id } })}
            />
          ))}
        </View>
      )}
    </ScrollScreen>
  );
}
