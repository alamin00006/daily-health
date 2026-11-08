import { router, useLocalSearchParams } from 'expo-router';

import { PlanForm } from '@/components/medicine/plan-form';
import { ScreenContainer } from '@/components/ui/screen-container';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ErrorState, LoadingList } from '@/components/ui/state-views';
import { usePlan, useUpdatePlan } from '@/features/medicine/use-medicine';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { showToast } from '@/lib/user-feedback';

export default function EditPlanScreen() {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const { profile } = useActiveProfile();
  const plan = usePlan(profile?.id, planId);
  const update = useUpdatePlan(profile?.id ?? '', planId ?? '');

  return (
    <ScreenContainer
      header={
        <ScreenHeader
          title="ওষুধ বদলান"
          subtitle={plan.data?.displayName}
          backIcon="close"
          fallbackHref="/medicine"
        />
      }>
      {plan.isError ? (
        <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />
      ) : !plan.data ? (
        <LoadingList rows={4} rowClassName="h-20" />
      ) : (
        <PlanForm
          plan={plan.data}
          submitLabel="সেভ করুন"
          submitting={update.isPending}
          error={update.error}
          onSubmit={({ medicineId: _medicineId, startDate: _startDate, ...values }) =>
            update.mutate(values, {
              onSuccess: () => {
                showToast('সেভ হয়েছে। অ্যালার্মও বদলে গেছে।');
                router.back();
              },
            })
          }
        />
      )}
    </ScreenContainer>
  );
}
