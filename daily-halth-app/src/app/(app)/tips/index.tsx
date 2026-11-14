import { Lightbulb } from 'lucide-react-native';
import { useState } from 'react';

import { HealthTipCard } from '@/components/content/health-tip-card';
import { ActionButton } from '@/components/ui/action-button';
import { ChipSelect } from '@/components/ui/chip-select';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { EmptyState, ErrorState, LoadingList } from '@/components/ui/state-views';
import { TIP_CATEGORY_LABELS } from '@/features/content/tip-display';
import { useHealthTips } from '@/features/content/use-health-tips';
import { tipCategorySchema, type TipCategory } from '@/shared-contracts/content.contract';

type Filter = TipCategory | 'ALL';

/** All health tips, newest first, by topic. */
export default function HealthTipsScreen() {
  const [filter, setFilter] = useState<Filter>('ALL');
  const tips = useHealthTips(filter === 'ALL' ? undefined : filter);
  const list = tips.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <ScrollScreen header={<ScreenHeader title="স্বাস্থ্য টিপস" fallbackHref="/home" />} onRefresh={() => tips.refetch()}>
      <ChipSelect<Filter>
        scroll
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'ALL', label: 'সব' },
          ...tipCategorySchema.options.map((c) => ({ value: c, label: TIP_CATEGORY_LABELS[c] })),
        ]}
      />
      {tips.isLoading ? (
        <LoadingList rows={3} rowClassName="h-56" />
      ) : tips.isError ? (
        <ErrorState error={tips.error} onRetry={() => void tips.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState icon={Lightbulb} title="এই বিষয়ে এখনো কোনো টিপস নেই" message="অন্য বিষয় বেছে দেখুন।" />
      ) : (
        <>
          {list.map((tip) => (
            <HealthTipCard key={tip.id} tip={tip} />
          ))}
          {tips.hasNextPage ? (
            <ActionButton
              label="আরও দেখুন"
              variant="outline"
              loading={tips.isFetchingNextPage}
              onPress={() => void tips.fetchNextPage()}
            />
          ) : null}
        </>
      )}
    </ScrollScreen>
  );
}
