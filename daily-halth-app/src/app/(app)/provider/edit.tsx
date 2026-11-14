import { router } from 'expo-router';

import { ProviderProfileForm } from '@/components/provider/provider-profile-form';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { ErrorState, SkeletonBlock } from '@/components/ui/state-views';
import { useMyProvider, useProviderProfileActions } from '@/features/provider/use-provider';
import { showToast } from '@/lib/user-feedback';

/** Edit the provider profile: details, specialties, online fees and options. */
export default function EditProviderScreen() {
  const me = useMyProvider();
  const { update } = useProviderProfileActions();
  return (
    <ScrollScreen header={<ScreenHeader title="প্রোফাইল সম্পাদনা" backIcon="close" fallbackHref="/provider" />}>
      {me.isLoading ? (
        <SkeletonBlock className="h-96" />
      ) : me.isError || !me.data ? (
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      ) : (
        <ProviderProfileForm
          profile={me.data}
          submitting={update.isPending}
          error={update.error}
          onUpdate={(body) =>
            update.mutate(body, {
              onSuccess: (row) => {
                showToast(
                  row.verificationStatus === 'PENDING' && me.data?.verificationStatus === 'VERIFIED'
                    ? 'সেভ হয়েছে। BMDC বদলেছে, তাই আবার যাচাই হবে।'
                    : 'সেভ হয়েছে'
                );
                router.back();
              },
            })
          }
        />
      )}
    </ScrollScreen>
  );
}
