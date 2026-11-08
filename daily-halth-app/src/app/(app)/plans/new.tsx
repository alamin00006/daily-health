import { router } from 'expo-router';

import { PlanForm } from '@/components/medicine/plan-form';
import { ScreenContainer } from '@/components/ui/screen-container';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ensureNotificationPermission } from '@/features/notifications/notification-setup';
import { useCreatePlan } from '@/features/medicine/use-medicine';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { showToast } from '@/lib/user-feedback';

export default function NewPlanScreen() {
  const { profile } = useActiveProfile();
  const create = useCreatePlan(profile?.id ?? '');

  return (
    <ScreenContainer
      header={
        <ScreenHeader
          title="ওষুধ যোগ করুন"
          subtitle={profile?.fullName}
          backIcon="close"
          fallbackHref="/medicine"
        />
      }>
      <PlanForm
        submitLabel="ওষুধ যোগ করুন"
        submitting={create.isPending}
        error={create.error}
        onSubmit={(values) =>
          create.mutate(values, {
            onSuccess: async (plan) => {
              // The first medicine is the moment to ask for alarms.
              await ensureNotificationPermission().catch(() => false);
              showToast(`${plan.displayName} যোগ হয়েছে`);
              router.back();
            },
          })
        }
      />
    </ScreenContainer>
  );
}
