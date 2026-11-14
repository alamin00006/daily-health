import { router, useLocalSearchParams } from 'expo-router';
import {
  Building2,
  CalendarPlus,
  CircleCheckBig,
  MapPin,
  Phone,
  Star,
  Timer,
  Wallet,
  XCircle,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { InlineAlert } from '@/components/ui/form-error-banner';
import { LabeledTextInput } from '@/components/ui/labeled-text-input';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { ErrorState, SkeletonBlock } from '@/components/ui/state-views';
import { StatusPill } from '@/components/ui/status-pill';
import { SurfaceCard } from '@/components/ui/surface-card';
import { apiErrorMessage } from '@/api/api-error-messages';
import { appointmentWhen } from '@/components/doctors/appointment-card';
import { BookedConsultCard } from '@/components/doctors/booked-consult-card';
import { VisitPrescriptionCard } from '@/components/doctors/visit-prescription-card';
import {
  MODE_ICON,
  MODE_LABEL,
  providerTitle,
  STATUS_LABEL,
  STATUS_TONE,
  taka,
} from '@/features/doctors/doctor-display';
import { useAppointment, useAppointmentActions } from '@/features/doctors/use-doctors';
import { METHOD_LABEL, REFUND_STATUS_TEXT } from '@/features/payments/payment-display';
import { usePayForItem } from '@/features/payments/use-payments';
import { canEdit } from '@/features/profiles/profile-permissions';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { banglaClock } from '@/lib/bangla-format';
import { confirmAction, showToast } from '@/lib/user-feedback';
import { colors } from '@/theme/design-tokens';

/** "৯:৪২" left until a time, updated every second. */
function useCountdown(until: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  if (!until) return null;
  const left = Math.max(0, Math.floor((Date.parse(until) - now) / 1000));
  return toBanglaDigits(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-4 border-t border-line/60 py-2.5">
      <BanglaText variant="caption">{label}</BanglaText>
      <BanglaText variant="label" className="flex-1 text-right">
        {value}
      </BanglaText>
    </View>
  );
}

export default function AppointmentScreen() {
  const { appointmentId, justBooked } = useLocalSearchParams<{
    appointmentId: string;
    justBooked?: string;
  }>();
  const { profile } = useActiveProfile();
  const appointment = useAppointment(profile?.id, appointmentId);
  const actions = useAppointmentActions(profile?.id ?? '', appointmentId ?? '');
  const pay = usePayForItem(profile?.id ?? '');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const a = appointment.data;
  const countdown = useCountdown(a?.status === 'PENDING_PAYMENT' ? a.payment.payBefore : null);
  const editable = canEdit(profile);

  async function cancel() {
    const ok = await confirmAction({
      title: 'অ্যাপয়েন্টমেন্ট বাতিল করবেন?',
      message:
        a?.status === 'CONFIRMED'
          ? 'পুরো টাকা যে মাধ্যমে দিয়েছেন সেখানেই ফেরত যাবে (৩–৭ কর্মদিবস)।'
          : 'সিরিয়াল বা সময়টি অন্য কেউ নিতে পারবে।',
      confirmLabel: 'বাতিল করুন',
      destructive: true,
    });
    if (!ok) return;
    actions.cancel.mutate(undefined, {
      onSuccess: () => showToast('বাতিল হয়েছে'),
      onError: (e) => showToast(apiErrorMessage(e)),
    });
  }

  return (
    <ScrollScreen
      header={<ScreenHeader title="অ্যাপয়েন্টমেন্ট" subtitle={a?.patientName} fallbackHref="/appointments" />}
      onRefresh={() => appointment.refetch()}>
      {appointment.isLoading ? (
        <>
          <SkeletonBlock className="h-40" />
          <SkeletonBlock className="h-52" />
        </>
      ) : appointment.isError || !a ? (
        <ErrorState error={appointment.error} onRetry={() => void appointment.refetch()} />
      ) : (
        <>
          {justBooked && a.status === 'CONFIRMED' ? (
            <InlineAlert tone="success" message="বুকিং নিশ্চিত হয়েছে। সময়মতো মনে করিয়ে দেওয়া হবে।" />
          ) : null}

          <SurfaceCard className="items-center gap-2 py-6">
            <StatusPill label={STATUS_LABEL[a.status]} tone={STATUS_TONE[a.status]} />
            {a.serialNo ? (
              <>
                <BanglaText variant="caption" className="mt-2">আপনার সিরিয়াল</BanglaText>
                <BanglaText className="font-display text-[56px] leading-[68px] text-primary">
                  {toBanglaDigits(a.serialNo)}
                </BanglaText>
              </>
            ) : (
              <BanglaText className="mt-2 font-bangla-bold text-[28px] leading-[40px] text-primary">
                {banglaClock(a.sessionStartTime)}
              </BanglaText>
            )}
            <BanglaText variant="body-strong">{appointmentWhen(a)}</BanglaText>
            <View className="mt-2 rounded-2xl bg-primary-50 px-4 py-2">
              <BanglaText className="text-center font-bangla-semibold text-[15px] leading-[22px] text-primary-700">
                বুকিং কোড: {a.code}
              </BanglaText>
            </View>
            {a.serialNo ? (
              <BanglaText variant="caption" className="px-4 text-center">
                চেম্বারের ডেস্কে কোড বা সিরিয়াল বলুন। সময়টি আনুমানিক; আগের রোগীদের ওপর নির্ভর করে।
              </BanglaText>
            ) : null}
          </SurfaceCard>

          {a.status === 'PENDING_PAYMENT' ? (
            <SurfaceCard className="gap-3 border border-warning/30">
              <View className="flex-row items-center gap-2">
                <Timer size={20} color={colors.warning} />
                <BanglaText variant="body-strong" className="flex-1">
                  {countdown} মিনিটের মধ্যে পেমেন্ট করুন
                </BanglaText>
              </View>
              <BanglaText variant="caption">
                সময়ের মধ্যে পেমেন্ট না হলে {a.serialNo ? 'সিরিয়ালটি' : 'সময়টি'} ছেড়ে দেওয়া হবে।
              </BanglaText>
              <ActionButton
                label={`${taka(a.payment.amount)} পেমেন্ট করুন`}
                icon={Wallet}
                loading={pay.isPending}
                disabled={!editable}
                onPress={() =>
                  pay.mutate(
                    { purpose: 'APPOINTMENT', referenceId: a.id },
                    {
                      onSuccess: (outcome) =>
                        showToast(
                          outcome.kind === 'paid'
                            ? 'পেমেন্ট হয়েছে, বুকিং নিশ্চিত'
                            : outcome.kind === 'failed'
                              ? 'পেমেন্ট হয়নি। আবার চেষ্টা করতে পারেন।'
                              : 'পেমেন্টের ফল এখনো আসেনি; একটু পরে দেখুন'
                        ),
                      onError: (e) => showToast(apiErrorMessage(e)),
                    }
                  )
                }
              />
              <BanglaText variant="caption" className="text-center">
                বিকাশ, নগদ, রকেট বা কার্ডে · নিরাপদ পেমেন্ট পাতায় খুলবে
              </BanglaText>
            </SurfaceCard>
          ) : null}

          {a.status === 'COMPLETED' || a.status === 'CONFIRMED' ? (
            <VisitPrescriptionCard appointmentId={a.id} profileId={a.patientId} />
          ) : null}

          {a.status === 'CONFIRMED' && (a.mode === 'VIDEO' || a.mode === 'CHAT') ? (
            <BookedConsultCard appointment={a} />
          ) : null}

          <SurfaceCard className="gap-1">
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: '/doctors/[providerId]', params: { providerId: a.provider.id } })
              }
              className="flex-row items-center gap-3 pb-3">
              <ProfileAvatar name={a.provider.displayName} photoUrl={a.provider.avatarThumbnailUrl} />
              <View className="flex-1">
                <BanglaText variant="body-strong">
                  {providerTitle(a.provider.type, a.provider.displayName)}
                </BanglaText>
                <BanglaText variant="caption">
                  {a.provider.qualifications}
                  {a.provider.bmdcNo ? ` · BMDC ${a.provider.bmdcNo}` : ''}
                </BanglaText>
              </View>
            </Pressable>
            <DetailRow label="রোগী" value={`${a.patientName} (${a.patientCode})`} />
            <DetailRow
              label="ধরন"
              value={`${MODE_LABEL[a.mode]}${a.kind === 'FOLLOW_UP' ? ' · ফলো-আপ' : ''}`}
            />
            <DetailRow label="ফি" value={taka(a.fee)} />
            {a.payment.invoiceNo ? (
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push({ pathname: '/payments/[paymentId]', params: { paymentId: a.payment.paymentId! } })
                }>
                <DetailRow
                  label="রসিদ"
                  value={`${a.payment.invoiceNo}${a.payment.method ? ` · ${METHOD_LABEL[a.payment.method as keyof typeof METHOD_LABEL] ?? ''}` : ''} ›`}
                />
              </Pressable>
            ) : null}
            {a.reason ? <DetailRow label="কারণ" value={a.reason} /> : null}
            {a.homeAddress ? <DetailRow label="ঠিকানা" value={a.homeAddress} /> : null}
            {a.cancelReason ? <DetailRow label="বাতিলের কারণ" value={a.cancelReason} /> : null}
          </SurfaceCard>

          {a.payment.refund ? (
            <InlineAlert
              tone={a.payment.refund.status === 'FAILED' ? 'danger' : a.payment.refund.status === 'PROCESSED' ? 'success' : 'info'}
              message={`${taka(a.payment.refund.amount)}: ${REFUND_STATUS_TEXT[a.payment.refund.status]}`}
            />
          ) : null}

          {a.chamber ? (
            <SurfaceCard className="gap-3">
              <View className="flex-row items-start gap-3">
                <Building2 size={22} color={colors.primary} />
                <View className="flex-1">
                  <BanglaText variant="body-strong">{a.chamber.hospital.name}</BanglaText>
                  <BanglaText variant="caption">
                    {a.chamber.hospital.address}, {a.chamber.hospital.district}
                    {a.chamber.room ? ` · ${a.chamber.room}` : ''}
                  </BanglaText>
                </View>
              </View>
              <View className="flex-row gap-2">
                {a.chamber.hospital.lat !== null && a.chamber.hospital.lng !== null ? (
                  <ActionButton
                    label="ম্যাপে দেখুন"
                    size="sm"
                    variant="outline"
                    icon={MapPin}
                    onPress={() =>
                      void Linking.openURL(
                        `https://www.google.com/maps/search/?api=1&query=${a.chamber!.hospital.lat},${a.chamber!.hospital.lng}`
                      )
                    }
                  />
                ) : null}
                {a.chamber.hospital.phone ? (
                  <ActionButton
                    label="ফোন করুন"
                    size="sm"
                    variant="outline"
                    icon={Phone}
                    onPress={() => void Linking.openURL(`tel:${a.chamber!.hospital.phone}`)}
                  />
                ) : null}
              </View>
            </SurfaceCard>
          ) : a.mode !== 'HOME_VISIT' && (a.status === 'CONFIRMED' || a.status === 'PENDING_PAYMENT') ? (
            <InlineAlert
              tone="info"
              message={`${MODE_LABEL[a.mode]}-এর সময় হলে এখানেই যোগ দেওয়ার বাটন আসবে। নোটিফিকেশন চালু রাখুন।`}
            />
          ) : null}

          {a.canReview && editable ? (
            <SurfaceCard className="gap-3">
              <BanglaText variant="body-strong">ডাক্তার কেমন দেখলেন?</BanglaText>
              <View className="flex-row justify-center gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityLabel={`${toBanglaDigits(value)} তারা`}
                    onPress={() => setRating(value)}
                    className="h-12 w-12 items-center justify-center">
                    <Star size={32} color="#e0a100" fill={value <= rating ? '#e0a100' : 'transparent'} />
                  </Pressable>
                ))}
              </View>
              <LabeledTextInput
                label="মন্তব্য (ঐচ্ছিক)"
                value={comment}
                onChangeText={setComment}
                maxLength={500}
                multiline
                helperText="আপনার পুরো নাম দেখানো হবে না"
              />
              <ActionButton
                label="মতামত দিন"
                disabled={rating === 0}
                loading={actions.review.isPending}
                onPress={() =>
                  actions.review.mutate(
                    { rating, comment: comment.trim() || undefined },
                    {
                      onSuccess: () => showToast('ধন্যবাদ! আপনার মতামত অন্যদের সাহায্য করবে'),
                      onError: (e) => showToast(apiErrorMessage(e)),
                    }
                  )
                }
              />
            </SurfaceCard>
          ) : a.myReview ? (
            <SurfaceCard className="flex-row items-center gap-2">
              <CircleCheckBig size={20} color={colors.success} />
              <BanglaText className="flex-1">
                আপনি {toBanglaDigits(a.myReview.rating)} তারা দিয়েছেন
              </BanglaText>
            </SurfaceCard>
          ) : null}

          {editable && a.status === 'COMPLETED' ? (
            <ActionButton
              label="আবার দেখান (ফলো-আপ বুক)"
              variant="secondary"
              icon={CalendarPlus}
              onPress={() =>
                router.push({
                  pathname: '/doctors/[providerId]/book',
                  params: { providerId: a.provider.id, parentAppointmentId: a.id },
                })
              }
            />
          ) : null}

          {editable && a.canCancel ? (
            <ActionButton
              label="অ্যাপয়েন্টমেন্ট বাতিল করুন"
              variant="danger"
              icon={XCircle}
              loading={actions.cancel.isPending}
              onPress={() => void cancel()}
            />
          ) : a.status === 'CONFIRMED' ? (
            <BanglaText variant="caption" className="text-center">
              ভিজিটের ২ ঘণ্টা আগে পর্যন্ত বাতিল করা যায়। এখন বদলাতে চেম্বারে যোগাযোগ করুন।
            </BanglaText>
          ) : null}

          <View className="flex-row items-center justify-center">
            {(() => {
              const Icon = MODE_ICON[a.mode];
              return <Icon size={14} color={colors.inkSubtle} />;
            })()}
            <BanglaText variant="caption" className="ml-1">
              {a.provider.providerCode} · {a.code}
            </BanglaText>
          </View>
        </>
      )}
    </ScrollScreen>
  );
}
