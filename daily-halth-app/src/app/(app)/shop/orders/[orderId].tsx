import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { Ban, Camera, CreditCard, FileText, MapPin } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { apiErrorMessage } from '@/api/api-error-messages';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ChipSelect } from '@/components/ui/chip-select';
import { FormErrorBanner, InlineAlert } from '@/components/ui/form-error-banner';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { ErrorState, LoadingList } from '@/components/ui/state-views';
import { StatusPill } from '@/components/ui/status-pill';
import { SurfaceCard } from '@/components/ui/surface-card';
import { providerTitle, taka } from '@/features/doctors/doctor-display';
import { usePayForItem } from '@/features/payments/use-payments';
import { usePrescriptions } from '@/features/prescriptions/use-prescriptions';
import {
  ORDER_STATUS_TEXT,
  ORDER_STATUS_TONE,
  ORDER_STEPS,
  PAYMENT_METHOD_TEXT,
  PRESCRIPTION_CHECK_TEXT,
} from '@/features/shop/shop-display';
import { useOrder, useOrderActions } from '@/features/shop/use-shop';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { formatDateTime } from '@/lib/bangla-format';
import { choosePhotoSource, pickPhoto } from '@/lib/pick-upload-file';
import { confirmAction, showToast } from '@/lib/user-feedback';
import type { OrderResponse } from '@/shared-contracts/shop.contract';
import { colors } from '@/theme/design-tokens';

const CANCEL_REASONS = ['ভুল করে অর্ডার করেছি', 'অন্য জায়গা থেকে কিনেছি', 'ঠিকানা বা পণ্য বদলাতে চাই', 'আর দরকার নেই'];

function Steps({ order }: { order: OrderResponse }) {
  const reached = ORDER_STEPS.indexOf(order.status);
  if (reached < 0) return null;
  return (
    <View className="flex-row items-center">
      {ORDER_STEPS.map((step, i) => (
        <View key={step} className="flex-1 items-center gap-1">
          <View className={`h-2 w-full rounded-full ${i <= reached ? 'bg-primary' : 'bg-line'}`} />
          <BanglaText variant="caption" className={`text-center text-[11px] ${i <= reached ? 'text-primary' : ''}`}>
            {ORDER_STATUS_TEXT[step]}
          </BanglaText>
        </View>
      ))}
    </View>
  );
}

function PrescriptionBox({ order }: { order: OrderResponse }) {
  const actions = useOrderActions(order.id);
  const prescriptions = usePrescriptions(order.patientId);
  const issued = useMemo(
    () => (prescriptions.data?.pages.flatMap((p) => p.data) ?? []).filter((p) => p.status === 'ISSUED'),
    [prescriptions.data]
  );
  const [error, setError] = useState<string | null>(null);
  const editable =
    ['PENDING_PAYMENT', 'PLACED'].includes(order.status) &&
    ['AWAITING_PRESCRIPTION', 'PENDING_REVIEW'].includes(order.prescriptionCheck);

  const upload = (source: 'camera' | 'library') =>
    void pickPhoto(source).then((file) => {
      if (!file) return;
      setError(null);
      actions.attachPhoto.mutate(file, {
        onSuccess: () => showToast('প্রেসক্রিপশন পাঠানো হয়েছে'),
        onError: (e) => setError(apiErrorMessage(e)),
      });
    });

  return (
    <SurfaceCard>
      <View className="mb-2 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <FileText size={18} color={colors.primary} />
          <BanglaText variant="body-strong">প্রেসক্রিপশন</BanglaText>
        </View>
        <StatusPill
          label={PRESCRIPTION_CHECK_TEXT[order.prescriptionCheck]}
          tone={order.prescriptionCheck === 'APPROVED' ? 'success' : order.prescriptionCheck === 'REJECTED' ? 'danger' : 'warning'}
        />
      </View>
      <FormErrorBanner message={error} />
      {order.prescription.code ? <BanglaText variant="body">অ্যাপের প্রেসক্রিপশন: {order.prescription.code}</BanglaText> : null}
      {order.prescription.photoUrl ? (
        <Image
          source={order.prescription.photoUrl}
          style={{ width: '100%', height: 220, borderRadius: 12 }}
          contentFit="contain"
          accessibilityLabel="প্রেসক্রিপশনের ছবি"
        />
      ) : null}
      {order.prescription.reviewNote ? <BanglaText variant="caption">ফার্মাসিস্টের নোট: {order.prescription.reviewNote}</BanglaText> : null}
      {editable ? (
        <View className="mt-2 gap-2">
          <BanglaText variant="caption">
            {order.prescriptionCheck === 'AWAITING_PRESCRIPTION'
              ? 'প্রেসক্রিপশন ছাড়া অর্ডার পাঠানো যাবে না। কাগজের প্রেসক্রিপশনের ছবি দিন, বা অ্যাপের প্রেসক্রিপশন বেছে নিন।'
              : 'ফার্মাসিস্ট দেখছেন। চাইলে ছবি বা প্রেসক্রিপশন বদলাতে পারেন।'}
          </BanglaText>
          <ActionButton
            label={order.prescription.photoUrl ? 'ছবি বদলান' : 'প্রেসক্রিপশনের ছবি দিন'}
            icon={Camera}
            variant="outline"
            loading={actions.attachPhoto.isPending}
            onPress={() => choosePhotoSource(upload)}
          />
          {issued.length > 0 ? (
            <ChipSelect
              label="অথবা অ্যাপের প্রেসক্রিপশন"
              value={order.prescription.code ? issued.find((r) => r.code === order.prescription.code)?.id : undefined}
              onChange={(id) =>
                actions.linkPrescription.mutate(id, {
                  onSuccess: () => showToast('প্রেসক্রিপশন যুক্ত হয়েছে'),
                  onError: (e) => setError(apiErrorMessage(e)),
                })
              }
              options={issued.map((rx) => ({
                value: rx.id,
                label: rx.provider ? `${rx.code} · ${providerTitle(rx.provider.type, rx.provider.displayName)}` : rx.code,
              }))}
            />
          ) : null}
        </View>
      ) : null}
    </SurfaceCard>
  );
}

/** One order: progress, pay if unpaid, prescription, items, address, cancel. */
export default function OrderScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const order = useOrder(orderId);
  const actions = useOrderActions(orderId);
  const pay = usePayForItem(order.data?.patientId ?? '');
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const o = order.data;
  const unpaid = o?.status === 'PENDING_PAYMENT';

  const startPay = () => {
    if (!o) return;
    setError(null);
    pay.mutate(
      { purpose: 'ORDER', referenceId: o.id },
      {
        onSuccess: (outcome) => {
          showToast(outcome.kind === 'paid' ? 'পেমেন্ট হয়েছে' : outcome.kind === 'failed' ? 'পেমেন্ট হয়নি' : 'পেমেন্টের ফল এখনো আসেনি');
          void order.refetch();
        },
        onError: (e) => setError(apiErrorMessage(e)),
      }
    );
  };

  const cancel = async () => {
    if (!reason) return;
    const ok = await confirmAction({
      title: 'অর্ডার বাতিল করবেন?',
      message: o?.isPaid ? 'পরিশোধ করা টাকা পুরোটা ফেরত দেওয়া হবে।' : 'অর্ডারটি আর পাঠানো হবে না।',
      confirmLabel: 'বাতিল করুন',
      destructive: true,
    });
    if (!ok) return;
    actions.cancel.mutate(reason, {
      onSuccess: () => (showToast('অর্ডার বাতিল হয়েছে'), setCancelling(false)),
      onError: (e) => setError(apiErrorMessage(e)),
    });
  };

  return (
    <ScrollScreen
      header={<ScreenHeader title={o ? `অর্ডার ${o.code}` : 'অর্ডার'} fallbackHref="/shop/orders" />}
      onRefresh={() => order.refetch()}
      footer={
        unpaid && o ? (
          <ActionButton label={`${taka(o.total)} পেমেন্ট করুন`} icon={CreditCard} loading={pay.isPending} onPress={startPay} />
        ) : undefined
      }>
      {order.isLoading ? (
        <LoadingList rows={3} rowClassName="h-32" />
      ) : order.isError ? (
        <ErrorState error={order.error} onRetry={() => void order.refetch()} />
      ) : o ? (
        <>
          <FormErrorBanner message={error} />
          <View className="flex-row items-center justify-between">
            <StatusPill label={ORDER_STATUS_TEXT[o.status]} tone={ORDER_STATUS_TONE[o.status]} />
            <BanglaText variant="caption">{formatDateTime(o.createdAt)}</BanglaText>
          </View>
          <Steps order={o} />
          {unpaid && o.holdExpiresAt ? (
            <InlineAlert message={`${formatDateTime(o.holdExpiresAt)}-এর মধ্যে পেমেন্ট না হলে অর্ডারটি বাতিল হয়ে যাবে।`} />
          ) : null}
          {o.cancelReason ? <InlineAlert tone="danger" message={`কারণ: ${o.cancelReason}`} /> : null}

          {o.prescriptionCheck !== 'NOT_NEEDED' ? <PrescriptionBox order={o} /> : null}

          <SurfaceCard>
            {o.items.map((item) => (
              <View key={item.productId} className="flex-row justify-between gap-3 py-1">
                <View className="flex-1">
                  <BanglaText variant="label">{item.name}</BanglaText>
                  <BanglaText variant="caption">
                    {taka(item.unitPrice)} × {toBanglaDigits(item.qty)}
                    {item.packSize ? ` · ${item.packSize}` : ''}
                  </BanglaText>
                </View>
                <BanglaText variant="label">{taka(item.lineTotal)}</BanglaText>
              </View>
            ))}
            <View className="my-2 h-px bg-line" />
            <View className="flex-row justify-between">
              <BanglaText variant="body">ডেলিভারি</BanglaText>
              <BanglaText variant="body">{o.deliveryCharge === 0 ? 'ফ্রি' : taka(o.deliveryCharge)}</BanglaText>
            </View>
            <View className="flex-row justify-between">
              <BanglaText variant="body-strong">মোট</BanglaText>
              <BanglaText variant="body-strong">{taka(o.total)}</BanglaText>
            </View>
            <BanglaText variant="caption" className="mt-1">
              {PAYMENT_METHOD_TEXT[o.paymentMethod]}
              {o.paymentMethod === 'ONLINE' ? (o.isPaid ? ' · পরিশোধিত' : ' · বাকি') : ''}
            </BanglaText>
          </SurfaceCard>

          <SurfaceCard>
            <View className="flex-row gap-3">
              <MapPin size={18} color={colors.primary} />
              <View className="flex-1">
                <BanglaText variant="body-strong">{o.address.recipientName}</BanglaText>
                <BanglaText variant="caption">{toBanglaDigits(o.address.phone.replace(/^\+88/, ''))}</BanglaText>
                <BanglaText variant="caption">
                  {o.address.addressLine}, {o.address.area} · {o.address.zoneName}
                </BanglaText>
              </View>
            </View>
          </SurfaceCard>

          <View className="gap-1">
            <BanglaText variant="body-strong">টাইমলাইন</BanglaText>
            {o.timeline.map((t, i) => (
              <BanglaText key={i} variant="caption">
                {formatDateTime(t.at)} · {ORDER_STATUS_TEXT[t.status]}
                {t.note ? ` — ${t.note}` : ''}
              </BanglaText>
            ))}
          </View>

          {o.canCancel ? (
            cancelling ? (
              <SurfaceCard>
                <ChipSelect label="কেন বাতিল করছেন?" value={reason} onChange={setReason} options={CANCEL_REASONS.map((r) => ({ value: r, label: r }))} />
                <View className="mt-3 gap-2">
                  <ActionButton label="বাতিল নিশ্চিত করুন" variant="danger" disabled={!reason} loading={actions.cancel.isPending} onPress={() => void cancel()} />
                  <ActionButton label="থাক" variant="ghost" onPress={() => setCancelling(false)} />
                </View>
              </SurfaceCard>
            ) : (
              <ActionButton label="অর্ডার বাতিল করুন" icon={Ban} variant="outline" onPress={() => setCancelling(true)} />
            )
          ) : null}
        </>
      ) : null}
    </ScrollScreen>
  );
}
