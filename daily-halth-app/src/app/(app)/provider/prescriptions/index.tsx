import { router } from 'expo-router';
import { FileText } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ChipSelect } from '@/components/ui/chip-select';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { EmptyState, ErrorState, LoadingList } from '@/components/ui/state-views';
import { StatusPill } from '@/components/ui/status-pill';
import { PRESCRIPTION_STATUS_LABEL, PRESCRIPTION_STATUS_TONE } from '@/features/provider/provider-display';
import { useProviderPrescriptions } from '@/features/provider/use-provider';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { formatDateTime } from '@/lib/bangla-format';
import { colors } from '@/theme/design-tokens';

const TABS = [
  { value: 'ALL', label: 'সব' },
  { value: 'DRAFT', label: 'খসড়া' },
  { value: 'ISSUED', label: 'দেওয়া' },
  { value: 'REVOKED', label: 'বাতিল' },
];

/** Prescriptions this provider wrote. New ones start from a visit or consultation. */
export default function ProviderPrescriptionsScreen() {
  const [status, setStatus] = useState('ALL');
  const list = useProviderPrescriptions(status);
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <ScrollScreen header={<ScreenHeader title="প্রেসক্রিপশন" fallbackHref="/provider" />} onRefresh={() => list.refetch()}>
      <ChipSelect options={TABS} value={status} onChange={setStatus} scroll />
      {list.isLoading ? (
        <LoadingList rows={3} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={FileText} title="কোনো প্রেসক্রিপশন নেই" message="অ্যাপয়েন্টমেন্ট বা পরামর্শের পাতা থেকে “প্রেসক্রিপশন” চেপে লিখুন।" />
      ) : (
        <View className="gap-3">
          {rows.map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/provider/prescriptions/[prescriptionId]', params: { prescriptionId: p.id } })}
              className="flex-row items-center gap-3 rounded-3xl border border-line bg-surface-card p-4 active:bg-primary-50">
              <View className="h-11 w-11 items-center justify-center rounded-2xl bg-primary-100">
                <FileText size={22} color={colors.primary} />
              </View>
              <View className="flex-1">
                <BanglaText variant="body-strong" numberOfLines={1}>
                  {p.patient.fullName}
                </BanglaText>
                <BanglaText variant="caption" numberOfLines={1}>
                  {p.code} · {toBanglaDigits(p.items.length)}টি ওষুধ · {formatDateTime(p.issuedAt ?? p.updatedAt)}
                </BanglaText>
              </View>
              <StatusPill label={PRESCRIPTION_STATUS_LABEL[p.status]} tone={PRESCRIPTION_STATUS_TONE[p.status]} />
            </Pressable>
          ))}
          {list.hasNextPage ? (
            <ActionButton label="আরও দেখুন" size="sm" variant="outline" loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} />
          ) : null}
        </View>
      )}
    </ScrollScreen>
  );
}
