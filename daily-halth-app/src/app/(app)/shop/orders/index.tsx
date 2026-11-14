import { router } from 'expo-router';
import { ClipboardList } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { EmptyState, ErrorState, LoadingList } from '@/components/ui/state-views';
import { StatusPill } from '@/components/ui/status-pill';
import { taka } from '@/features/doctors/doctor-display';
import { ORDER_STATUS_TEXT, ORDER_STATUS_TONE, PRESCRIPTION_CHECK_TEXT } from '@/features/shop/shop-display';
import { useMyOrders } from '@/features/shop/use-shop';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { formatDateTime } from '@/lib/bangla-format';

/** The buyer's HealthStore orders, newest first (still shown when the shop is off). */
export default function MyOrdersScreen() {
  const orders = useMyOrders();
  const list = orders.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <ScrollScreen header={<ScreenHeader title="আমার অর্ডার" fallbackHref="/shop" />} onRefresh={() => orders.refetch()}>
      {orders.isLoading ? (
        <LoadingList rows={4} rowClassName="h-24" />
      ) : orders.isError ? (
        <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState icon={ClipboardList} title="এখনো কোনো অর্ডার নেই" message="হেলথস্টোর থেকে অর্ডার করলে এখানে দেখা যাবে।" />
      ) : (
        <>
          {list.map((o) => (
            <Pressable
              key={o.id}
              accessibilityRole="button"
              accessibilityLabel={`অর্ডার ${o.code}`}
              onPress={() => router.push({ pathname: '/shop/orders/[orderId]', params: { orderId: o.id } })}
              className="gap-2 rounded-2xl border border-line/70 bg-surface-card p-4 active:bg-primary-50">
              <View className="flex-row items-center justify-between">
                <BanglaText variant="body-strong">{o.code}</BanglaText>
                <StatusPill label={ORDER_STATUS_TEXT[o.status]} tone={ORDER_STATUS_TONE[o.status]} />
              </View>
              <BanglaText variant="body" numberOfLines={1}>
                {o.firstItemName}
                {o.itemCount > 1 ? ` ও আরও (${toBanglaDigits(o.itemCount)}টি)` : ''}
              </BanglaText>
              <View className="flex-row items-center justify-between">
                <BanglaText variant="caption">{formatDateTime(o.createdAt)}</BanglaText>
                <BanglaText variant="body-strong">{taka(o.total)}</BanglaText>
              </View>
              {o.prescriptionCheck === 'AWAITING_PRESCRIPTION' || o.prescriptionCheck === 'REJECTED' ? (
                <StatusPill label={PRESCRIPTION_CHECK_TEXT[o.prescriptionCheck]} tone="warning" />
              ) : null}
            </Pressable>
          ))}
          {orders.hasNextPage ? (
            <ActionButton
              label="আরও দেখুন"
              variant="outline"
              loading={orders.isFetchingNextPage}
              onPress={() => void orders.fetchNextPage()}
            />
          ) : null}
        </>
      )}
    </ScrollScreen>
  );
}
