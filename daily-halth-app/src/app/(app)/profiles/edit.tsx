import { router, useLocalSearchParams } from 'expo-router';
import { Trash2, UserX } from 'lucide-react-native';
import { View } from 'react-native';

import { ProfileForm } from '@/components/profile/profile-form';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ScreenContainer } from '@/components/ui/screen-container';
import { ScreenHeader } from '@/components/ui/screen-header';
import { EmptyState, ErrorState, LoadingList } from '@/components/ui/state-views';
import { apiErrorMessage } from '@/api/api-error-messages';
import { canManageMembers } from '@/features/profiles/profile-permissions';
import { useDeleteProfile, useProfiles, useUpdateProfile } from '@/features/profiles/use-profiles';
import { confirmAction, showToast } from '@/lib/user-feedback';

export default function EditProfileScreen() {
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const profiles = useProfiles();
  const profile = profiles.data?.find((p) => p.id === profileId);
  const update = useUpdateProfile(profileId ?? '');
  const remove = useDeleteProfile();

  const header = <ScreenHeader title="প্রোফাইলের তথ্য" backIcon="close" fallbackHref="/health" />;
  if (!profile) {
    return (
      <ScreenContainer header={header}>
        {profiles.isPending ? (
          <LoadingList rows={4} rowClassName="h-16" />
        ) : profiles.isError ? (
          <ErrorState error={profiles.error} onRetry={() => void profiles.refetch()} />
        ) : (
          // Deleted meanwhile, or access was removed.
          <EmptyState
            icon={UserX}
            title="প্রোফাইলটি পাওয়া যায়নি"
            message="এটি মুছে ফেলা হয়েছে বা আপনার দেখার অনুমতি নেই।"
            actionLabel="ফিরে যান"
            onAction={() => router.back()}
          />
        )}
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer header={header}>
      <ProfileForm
        profile={profile}
        hasOwnProfile
        submitLabel="সেভ করুন"
        submitting={update.isPending}
        error={update.error}
        onSubmit={({ relation: _relation, ...values }) =>
          update.mutate(values, {
            onSuccess: () => {
              showToast('তথ্য সেভ হয়েছে');
              router.back();
            },
          })
        }
      />

      {canManageMembers(profile) ? (
        <View className="mt-4 gap-2 rounded-3xl border border-danger/20 p-4">
          <BanglaText variant="body-strong">প্রোফাইল মুছে ফেলুন</BanglaText>
          <BanglaText variant="caption">
            পরিবারের যারা এই প্রোফাইল দেখতেন, তারাও আর দেখতে পারবেন না। ওষুধের অ্যালার্ম বন্ধ হয়ে
            যাবে।
          </BanglaText>
          <ActionButton
            label="মুছে ফেলুন"
            icon={Trash2}
            variant="danger"
            size="sm"
            loading={remove.isPending}
            onPress={async () => {
              const ok = await confirmAction({
                title: `${profile.fullName}-এর প্রোফাইল মুছবেন?`,
                message: 'এটি আর ফেরানো যাবে না।',
                confirmLabel: 'মুছে ফেলুন',
                destructive: true,
              });
              if (!ok) return;
              remove.mutate(profile.id, {
                onSuccess: () => {
                  showToast('প্রোফাইল মুছে ফেলা হয়েছে');
                  router.dismissTo('/health');
                },
                onError: (error) => showToast(apiErrorMessage(error)),
              });
            }}
          />
        </View>
      ) : null}
    </ScreenContainer>
  );
}
