import { useLocalSearchParams } from 'expo-router';
import { BadgeCheck, RotateCcw } from 'lucide-react-native';
import { View } from 'react-native';

import { BanglaText } from '@/components/ui/bangla-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { ErrorState, SkeletonBlock } from '@/components/ui/state-views';
import { StatusPill } from '@/components/ui/status-pill';
import { SurfaceCard } from '@/components/ui/surface-card';
import { taka } from '@/features/doctors/doctor-display';
import {
  GATEWAY_LABEL,
  METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
  REFUND_STATUS_TEXT,
} from '@/features/payments/payment-display';
import { usePayment } from '@/features/payments/use-payments';
import { formatDateTime } from '@/lib/bangla-format';
import { colors } from '@/theme/design-tokens';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-4 border-t border-line/60 py-2.5">
      <BanglaText variant="caption">{label}</BanglaText>
      <BanglaText variant="label" className="flex-1 text-right">
        {value}
      </BanglaText>
    </View>
  );
}

/** A receipt: what was paid, how, and any refund. */
export default function ReceiptScreen() {
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();
  const payment = usePayment(paymentId);
  const p = payment.data;

  return (
    <ScrollScreen
      header={<ScreenHeader title="রসিদ" subtitle={p?.invoiceNo} fallbackHref="/payments" />}
      onRefresh={() => payment.refetch()}>
      {payment.isLoading ? (
        <SkeletonBlock className="h-72" />
      ) : payment.isError || !p ? (
        <ErrorState error={payment.error} onRetry={() => void payment.refetch()} />
      ) : (
        <>
          <SurfaceCard className="items-center gap-2 py-6">
            <BadgeCheck size={40} color={p.status === 'SUCCESS' ? colors.success : colors.inkMuted} />
            <BanglaText className="font-bangla-bold text-[32px] leading-[44px] text-ink">
              {taka(p.amount)}
            </BanglaText>
            <StatusPill label={PAYMENT_STATUS_LABEL[p.status]} tone={PAYMENT_STATUS_TONE[p.status]} />
            <BanglaText variant="caption" className="px-4 text-center">
              {p.description}
            </BanglaText>
          </SurfaceCard>

          <SurfaceCard className="gap-0">
            <Row label="রসিদ নম্বর" value={p.invoiceNo} />
            {p.paidAt ? <Row label="পেমেন্টের সময়" value={formatDateTime(p.paidAt)} /> : null}
            <Row
              label="মাধ্যম"
              value={`${p.method ? METHOD_LABEL[p.method] : '—'} · ${GATEWAY_LABEL[p.gateway]}`}
            />
            {p.gatewayTrxId ? <Row label="ট্রানজেকশন আইডি" value={p.gatewayTrxId} /> : null}
          </SurfaceCard>

          {p.refunds.map((refund) => (
            <SurfaceCard key={refund.id} className="gap-2">
              <View className="flex-row items-center gap-2">
                <RotateCcw size={18} color={colors.primary} />
                <BanglaText variant="body-strong" className="flex-1">
                  {taka(refund.amount)} ফেরত
                </BanglaText>
                <StatusPill
                  label={refund.status === 'PROCESSED' ? 'ফেরত গেছে' : refund.status === 'FAILED' ? 'সমস্যা' : 'চলছে'}
                  tone={refund.status === 'PROCESSED' ? 'success' : refund.status === 'FAILED' ? 'danger' : 'warning'}
                />
              </View>
              <BanglaText variant="caption">{refund.reason}</BanglaText>
              <BanglaText variant="caption" className="text-ink">
                {REFUND_STATUS_TEXT[refund.status]}
              </BanglaText>
            </SurfaceCard>
          ))}
          <BanglaText variant="caption" className="text-center">
            কোনো সমস্যায় সাপোর্টে রসিদ নম্বরটি বলুন।
          </BanglaText>
        </>
      )}
    </ScrollScreen>
  );
}
