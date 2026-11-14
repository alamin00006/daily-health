import { router } from 'expo-router';
import { ReceiptText } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { CurrentProfileChip } from '@/components/profile/active-profile-chip';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { EmptyState, ErrorState, LoadingList } from '@/components/ui/state-views';
import { StatusPill } from '@/components/ui/status-pill';
import { taka } from '@/features/doctors/doctor-display';
import {
  METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
} from '@/features/payments/payment-display';
import { usePayments } from '@/features/payments/use-payments';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { formatDateTime } from '@/lib/bangla-format';
import { shadows } from '@/theme/design-tokens';

/** A profile's paid and refunded payments, newest first. */
export default function PaymentsScreen() {
  const { profile } = useActiveProfile();
  const payments = usePayments(profile?.id);
  const items = payments.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <ScrollScreen
      header={<ScreenHeader title="পেমেন্ট ও রসিদ" fallbackHref="/health" />}
      onRefresh={() => payments.refetch()}>
      <CurrentProfileChip />
      {payments.isLoading ? (
        <LoadingList rows={3} rowClassName="h-24" />
      ) : payments.isError ? (
        <ErrorState error={payments.error} onRetry={() => void payments.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="এখনো কোনো পেমেন্ট নেই"
          message="ডাক্তারের অ্যাপয়েন্টমেন্টের পেমেন্টের রসিদ এখানে থাকবে।"
        />
      ) : (
        <View className="gap-3">
          {items.map((payment) => (
            <Pressable
              key={payment.id}
              accessibilityRole="button"
              style={shadows.card}
              onPress={() =>
                router.push({ pathname: '/payments/[paymentId]', params: { paymentId: payment.id } })
              }
              className="gap-2 rounded-3xl bg-surface-card p-4 active:opacity-90">
              <View className="flex-row items-center justify-between">
                <BanglaText className="font-bangla-bold text-[18px] leading-[28px]">
                  {taka(payment.amount)}
                </BanglaText>
                <StatusPill
                  label={PAYMENT_STATUS_LABEL[payment.status]}
                  tone={PAYMENT_STATUS_TONE[payment.status]}
                />
              </View>
              <BanglaText variant="label" numberOfLines={2}>
                {payment.description}
              </BanglaText>
              <BanglaText variant="caption">
                {payment.invoiceNo}
                {payment.method ? ` · ${METHOD_LABEL[payment.method]}` : ''}
                {payment.paidAt ? ` · ${formatDateTime(payment.paidAt)}` : ''}
              </BanglaText>
            </Pressable>
          ))}
          {payments.hasNextPage ? (
            <ActionButton
              label="আরও দেখুন"
              variant="ghost"
              loading={payments.isFetchingNextPage}
              onPress={() => void payments.fetchNextPage()}
            />
          ) : null}
        </View>
      )}
    </ScrollScreen>
  );
}
