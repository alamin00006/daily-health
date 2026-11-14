import { router } from 'expo-router';
import { Check, MapPin, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { apiErrorMessage } from '@/api/api-error-messages';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ChipSelect } from '@/components/ui/chip-select';
import { FormErrorBanner, InlineAlert } from '@/components/ui/form-error-banner';
import { SectionHeader } from '@/components/ui/list-row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { ErrorState, LoadingList } from '@/components/ui/state-views';
import { SurfaceCard } from '@/components/ui/surface-card';
import { providerTitle, taka } from '@/features/doctors/doctor-display';
import { usePayForItem } from '@/features/payments/use-payments';
import { usePrescriptions } from '@/features/prescriptions/use-prescriptions';
import { canEdit } from '@/features/profiles/profile-permissions';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { PAYMENT_METHOD_TEXT } from '@/features/shop/shop-display';
import { useAddresses, useCheckoutPreview, usePlaceOrder } from '@/features/shop/use-shop';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { showToast } from '@/lib/user-feedback';
import type { OrderPaymentMethod } from '@/shared-contracts/shop.contract';
import { colors } from '@/theme/design-tokens';

const PHOTO_LATER = 'PHOTO';

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="flex-row justify-between py-0.5">
      <BanglaText variant={strong ? 'body-strong' : 'body'}>{label}</BanglaText>
      <BanglaText variant={strong ? 'body-strong' : 'body'}>{value}</BanglaText>
    </View>
  );
}

/** Whose care, where to deliver, how to pay, prescription; then place the order (and pay online). */
export default function CheckoutScreen() {
  const { profile: active, profiles } = useActiveProfile();
  const editable = profiles.filter((p) => canEdit(p));
  const [patientId, setPatientId] = useState<string | undefined>(
    active && canEdit(active) ? active.id : editable[0]?.id
  );
  const addresses = useAddresses();
  const [chosenAddress, setChosenAddress] = useState<string | undefined>();
  const addressId = chosenAddress ?? addresses.data?.find((a) => a.isDefault)?.id ?? addresses.data?.[0]?.id;
  const preview = useCheckoutPreview(addressId);
  const [method, setMethod] = useState<OrderPaymentMethod>('ONLINE');
  const [rxChoice, setRxChoice] = useState<string>(PHOTO_LATER);
  const prescriptions = usePrescriptions(preview.data?.cart.requiresPrescription ? patientId : undefined);
  const issued = useMemo(
    () => (prescriptions.data?.pages.flatMap((p) => p.data) ?? []).filter((p) => p.status === 'ISSUED'),
    [prescriptions.data]
  );
  const place = usePlaceOrder();
  const pay = usePayForItem(patientId ?? '');
  const [error, setError] = useState<string | null>(null);

  const p = preview.data;
  const blockers = p?.problems ?? [];
  const belowMin = blockers.some((b) => b.code === 'BELOW_MIN_ORDER');
  const ready = Boolean(p && patientId && addressId && blockers.length === 0);
  const busy = place.isPending || pay.isPending;

  const submit = () => {
    if (!patientId || !addressId) return;
    setError(null);
    place.mutate(
      {
        patientId,
        addressId,
        paymentMethod: method,
        prescriptionId: p?.cart.requiresPrescription && rxChoice !== PHOTO_LATER ? rxChoice : undefined,
      },
      {
        onSuccess: (order) => {
          const open = () => router.replace({ pathname: '/shop/orders/[orderId]', params: { orderId: order.id } });
          if (order.status !== 'PENDING_PAYMENT') {
            showToast('অর্ডার নেওয়া হয়েছে');
            open();
            return;
          }
          pay.mutate(
            { purpose: 'ORDER', referenceId: order.id },
            {
              onSuccess: (outcome) => {
                showToast(
                  outcome.kind === 'paid'
                    ? 'পেমেন্ট হয়েছে, অর্ডার নেওয়া হয়েছে'
                    : outcome.kind === 'failed'
                      ? 'পেমেন্ট হয়নি; অর্ডার থেকে আবার চেষ্টা করুন'
                      : 'পেমেন্টের ফল এখনো আসেনি; অর্ডারে দেখুন'
                );
                open();
              },
              onError: () => open(),
            }
          );
        },
        onError: (e) => setError(apiErrorMessage(e)),
      }
    );
  };

  return (
    <ScrollScreen
      header={<ScreenHeader title="অর্ডার করুন" fallbackHref="/shop/cart" />}
      footer={
        p ? (
          <View className="gap-2">
            {p.total !== null ? <Row label="মোট" value={taka(p.total)} strong /> : null}
            <ActionButton
              label={method === 'ONLINE' ? 'অর্ডার করে পেমেন্ট করুন' : 'অর্ডার নিশ্চিত করুন'}
              disabled={!ready}
              loading={busy}
              onPress={submit}
            />
          </View>
        ) : undefined
      }>
      {preview.isLoading ? (
        <LoadingList rows={3} rowClassName="h-28" />
      ) : preview.isError ? (
        <ErrorState error={preview.error} onRetry={() => void preview.refetch()} />
      ) : p ? (
        <>
          {error ? <FormErrorBanner message={error} /> : null}
          {belowMin ? (
            <InlineAlert tone="danger" message={`সর্বনিম্ন অর্ডার ${taka(p.minOrderAmount)}। আরও কিছু যোগ করুন।`} />
          ) : blockers.length > 0 ? (
            <InlineAlert tone="danger" message="কার্টে কিছু সমস্যা আছে। কার্টে ফিরে ঠিক করুন।" />
          ) : null}

          <ChipSelect
            label="কার জন্য"
            value={patientId}
            onChange={setPatientId}
            options={editable.map((pr) => ({ value: pr.id, label: pr.fullName }))}
          />

          <View className="gap-2">
            <SectionHeader
              title="ডেলিভারি ঠিকানা"
              actionLabel="নতুন ঠিকানা"
              onAction={() => router.push('/shop/address-form')}
            />
            {addresses.data && addresses.data.length === 0 ? (
              <ActionButton label="ঠিকানা যোগ করুন" icon={Plus} variant="outline" onPress={() => router.push('/shop/address-form')} />
            ) : (
              (addresses.data ?? []).map((a) => {
                const selected = a.id === addressId;
                return (
                  <Pressable
                    key={a.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setChosenAddress(a.id)}
                    className={`flex-row gap-3 rounded-2xl border p-4 ${selected ? 'border-primary bg-primary-50' : 'border-line bg-surface-card'}`}>
                    <MapPin size={20} color={selected ? colors.primary : colors.inkMuted} />
                    <View className="flex-1">
                      <BanglaText variant="body-strong">
                        {a.recipientName}
                        {a.label ? ` · ${a.label}` : ''}
                      </BanglaText>
                      <BanglaText variant="caption">
                        {a.addressLine}, {a.area}
                      </BanglaText>
                      <BanglaText variant="caption">
                        {a.zone.name} · ডেলিভারি {taka(a.zone.charge)}
                        {a.zone.estimate ? ` · ${a.zone.estimate}` : ''}
                      </BanglaText>
                    </View>
                    {selected ? <Check size={20} color={colors.primary} /> : null}
                  </Pressable>
                );
              })
            )}
          </View>

          <ChipSelect<OrderPaymentMethod>
            label="পেমেন্ট"
            value={method}
            onChange={setMethod}
            options={[
              { value: 'ONLINE', label: PAYMENT_METHOD_TEXT.ONLINE },
              ...(p.cashOnDeliveryAvailable
                ? [{ value: 'CASH_ON_DELIVERY' as const, label: PAYMENT_METHOD_TEXT.CASH_ON_DELIVERY }]
                : []),
            ]}
          />

          {p.cart.requiresPrescription ? (
            <View className="gap-2">
              <InlineAlert message="কার্টে প্রেসক্রিপশনের ওষুধ আছে। অ্যাপের প্রেসক্রিপশন বেছে নিন, অথবা অর্ডারের পর কাগজের প্রেসক্রিপশনের ছবি দিন। আমাদের ফার্মাসিস্ট দেখে অনুমোদন দিলে অর্ডার পাঠানো হবে।" />
              <ChipSelect
                label="প্রেসক্রিপশন"
                value={rxChoice}
                onChange={setRxChoice}
                options={[
                  { value: PHOTO_LATER, label: 'ছবি দেব' },
                  ...issued.map((rx) => ({
                    value: rx.id,
                    label: rx.provider ? `${rx.code} · ${providerTitle(rx.provider.type, rx.provider.displayName)}` : rx.code,
                  })),
                ]}
              />
            </View>
          ) : null}

          <SurfaceCard>
            <Row label={`পণ্য (${toBanglaDigits(p.cart.itemCount)}টি)`} value={taka(p.cart.subtotal)} />
            <Row
              label="ডেলিভারি চার্জ"
              value={p.deliveryCharge === null ? 'ঠিকানা বেছে নিন' : p.deliveryCharge === 0 ? 'ফ্রি' : taka(p.deliveryCharge)}
            />
            {p.cart.savings > 0 ? (
              <BanglaText variant="caption" className="text-success">
                MRP-র চেয়ে {taka(p.cart.savings)} কম দামে পাচ্ছেন (দামে ধরা আছে)
              </BanglaText>
            ) : null}
            {p.freeDeliveryFrom !== null && p.deliveryCharge !== 0 ? (
              <BanglaText variant="caption" className="mt-1">
                {taka(p.freeDeliveryFrom)} বা বেশি অর্ডারে ডেলিভারি ফ্রি
              </BanglaText>
            ) : null}
          </SurfaceCard>
        </>
      ) : null}
    </ScrollScreen>
  );
}
