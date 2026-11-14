import { router } from 'expo-router';
import { FileText } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { CurrentProfileChip } from '@/components/profile/active-profile-chip';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { EmptyState, ErrorState, LoadingList } from '@/components/ui/state-views';
import { StatusPill } from '@/components/ui/status-pill';
import { usePrescriptions } from '@/features/prescriptions/use-prescriptions';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { formatDateTime } from '@/lib/bangla-format';
import type { PrescriptionResponse } from '@/shared-contracts/prescription.contract';
import { colors } from '@/theme/design-tokens';

function Row({ p }: { p: PrescriptionResponse }) {
  const doctor = p.provider ? `ডা. ${p.provider.displayName}` : 'ডাক্তার';
  const withAlarm = p.items.filter((i) => i.alarm?.isActive).length;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({ pathname: '/prescriptions/[prescriptionId]', params: { prescriptionId: p.id } })
      }
      className="flex-row items-center gap-3 rounded-3xl border border-line bg-surface-card p-4 active:bg-primary-50">
      <View className="h-11 w-11 items-center justify-center rounded-2xl bg-primary-100">
        <FileText size={22} color={colors.primary} />
      </View>
      <View className="flex-1">
        <BanglaText variant="body-strong" numberOfLines={1}>
          {doctor}
        </BanglaText>
        <BanglaText variant="caption" numberOfLines={1}>
          {p.diagnosis ?? `${toBanglaDigits(p.items.length)}টি ওষুধ`}
        </BanglaText>
        <BanglaText variant="caption">
          {p.issuedAt ? formatDateTime(p.issuedAt) : ''} · {p.code}
        </BanglaText>
      </View>
      {p.status === 'REVOKED' ? (
        <StatusPill label="বাতিল" tone="danger" />
      ) : p.items.length > 0 ? (
        <StatusPill
          label={withAlarm === p.items.length ? 'অ্যালার্ম চালু' : `${toBanglaDigits(p.items.length - withAlarm)}টি অ্যালার্ম বাকি`}
          tone={withAlarm === p.items.length ? 'success' : 'warning'}
        />
      ) : null}
    </Pressable>
  );
}

/** Prescriptions doctors issued for the active profile. */
export default function PrescriptionsScreen() {
  const { profile } = useActiveProfile();
  const list = usePrescriptions(profile?.id);
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <ScrollScreen
      header={<ScreenHeader title="প্রেসক্রিপশন" subtitle="ডাক্তারের দেওয়া ডিজিটাল প্রেসক্রিপশন" fallbackHref="/health" />}
      onRefresh={() => list.refetch()}>
      <CurrentProfileChip />
      {list.isLoading ? (
        <LoadingList rows={3} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="এখনো কোনো প্রেসক্রিপশন নেই"
          message="অ্যাপে ডাক্তার দেখালে তাঁর দেওয়া প্রেসক্রিপশন এখানে আসবে। কাগজের প্রেসক্রিপশনের ছবি রিপোর্টে রাখতে পারেন।"
          actionLabel="ডাক্তার দেখান"
          onAction={() => router.push('/doctors')}
        />
      ) : (
        <View className="gap-3">
          {rows.map((p) => (
            <Row key={p.id} p={p} />
          ))}
          {list.hasNextPage ? (
            <ActionButton
              label="আরও দেখুন"
              size="sm"
              variant="outline"
              loading={list.isFetchingNextPage}
              onPress={() => void list.fetchNextPage()}
            />
          ) : null}
        </View>
      )}
    </ScrollScreen>
  );
}
