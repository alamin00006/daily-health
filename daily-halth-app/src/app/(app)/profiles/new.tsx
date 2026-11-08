import { router, useLocalSearchParams } from 'expo-router';

import { ProfileForm } from '@/components/profile/profile-form';
import { ScreenContainer } from '@/components/ui/screen-container';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useCreateProfile, useProfiles } from '@/features/profiles/use-profiles';
import { showToast } from '@/lib/user-feedback';
import type { ProfileRelation } from '@/shared-contracts/profiles.contract';

export default function NewProfileScreen() {
  const params = useLocalSearchParams<{ relation?: ProfileRelation }>();
  const profiles = useProfiles();
  const create = useCreateProfile();
  const hasOwnProfile = (profiles.data ?? []).some((p) => p.myRelation === 'SELF');

  return (
    <ScreenContainer
      header={
        <ScreenHeader
          title={params.relation === 'SELF' ? 'নিজের প্রোফাইল' : 'নতুন প্রোফাইল'}
          subtitle="পরে যেকোনো সময় বদলাতে পারবেন"
          backIcon="close"
          fallbackHref="/home"
        />
      }>
      <ProfileForm
        initialRelation={params.relation}
        hasOwnProfile={hasOwnProfile}
        submitLabel="প্রোফাইল তৈরি করুন"
        submitting={create.isPending}
        error={create.error}
        onSubmit={(values) =>
          create.mutate(values, {
            onSuccess: (profile) => {
              showToast(`${profile.fullName}-এর প্রোফাইল তৈরি হয়েছে`);
              router.back();
            },
          })
        }
      />
    </ScreenContainer>
  );
}
