import { router } from 'expo-router';
import { Plus, ShieldPlus } from 'lucide-react-native';
import { View } from 'react-native';

import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ListRow } from '@/components/ui/list-row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { EmptyState, ErrorState, LoadingList } from '@/components/ui/state-views';
import { SurfaceCard } from '@/components/ui/surface-card';
import { CONDITION_KIND_META } from '@/features/health/health-display';
import { useConditions } from '@/features/health/use-health';
import { canEdit } from '@/features/profiles/profile-permissions';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { formatDate } from '@/lib/bangla-format';
import type { ConditionKind } from '@/shared-contracts/health.contract';

const KINDS: ConditionKind[] = ['CHRONIC', 'ALLERGY', 'SURGERY'];

export default function ConditionsScreen() {
  const { profile } = useActiveProfile();
  const editable = canEdit(profile);
  const conditions = useConditions(profile?.id);
  const items = conditions.data ?? [];

  return (
    <ScrollScreen
      header={
        <ScreenHeader
          title="রোগ ও অ্যালার্জি"
          subtitle={profile?.fullName}
          fallbackHref="/health"
        />
      }
      onRefresh={() => conditions.refetch()}
      footer={
        editable ? (
          <ActionButton
            label="নতুন যোগ করুন"
            icon={Plus}
            onPress={() => router.push('/conditions/form')}
          />
        ) : undefined
      }>
      <BanglaText variant="label" className="font-bangla text-ink-muted">
        জরুরি অবস্থায় হেলথ কার্ড স্ক্যান করলে ডাক্তার এই তালিকা দেখতে পাবেন। নোটগুলো শুধু পরিবারের
        সদস্যরা দেখেন।
      </BanglaText>

      {conditions.isLoading ? (
        <LoadingList rows={3} rowClassName="h-16" />
      ) : conditions.isError ? (
        <ErrorState error={conditions.error} onRetry={() => void conditions.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ShieldPlus}
          title="এখনো কিছু লেখা হয়নি"
          message="ডায়াবেটিস, উচ্চ রক্তচাপ, কোনো ওষুধে অ্যালার্জি বা আগের অপারেশন থাকলে লিখে রাখুন।"
        />
      ) : (
        KINDS.map((kind) => {
          const group = items.filter((c) => c.kind === kind);
          if (group.length === 0) return null;
          return (
            <View key={kind} className="gap-2">
              <BanglaText variant="label" className="font-bangla-semibold text-ink-muted">
                {CONDITION_KIND_META[kind].plural}
              </BanglaText>
              <SurfaceCard className="py-1">
                {group.map((condition, index) => (
                  <ListRow
                    key={condition.id}
                    title={condition.name}
                    subtitle={[
                      condition.since
                        ? kind === 'SURGERY'
                          ? `${formatDate(condition.since)}-এ`
                          : `${formatDate(condition.since)} থেকে`
                        : null,
                      condition.note,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    onPress={
                      editable
                        ? () =>
                            router.push({
                              pathname: '/conditions/form',
                              params: { conditionId: condition.id },
                            })
                        : undefined
                    }
                    divider={index < group.length - 1}
                  />
                ))}
              </SurfaceCard>
            </View>
          );
        })
      )}
    </ScrollScreen>
  );
}
