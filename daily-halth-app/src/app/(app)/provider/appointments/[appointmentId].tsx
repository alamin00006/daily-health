import { router, useLocalSearchParams } from 'expo-router';
import { CheckCircle2, FileText, MessagesSquare, UserX, Video, XCircle } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { apiErrorMessage } from '@/api/api-error-messages';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ChipSelect } from '@/components/ui/chip-select';
import { InlineAlert } from '@/components/ui/form-error-banner';
import { LabeledTextInput } from '@/components/ui/labeled-text-input';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { ErrorState, SkeletonBlock } from '@/components/ui/state-views';
import { StatusPill } from '@/components/ui/status-pill';
import { SurfaceCard } from '@/components/ui/surface-card';
import { MODE_LABEL, STATUS_LABEL, STATUS_TONE, taka } from '@/features/doctors/doctor-display';
import {
  usePrescriptionWriting,
  useProviderAppointment,
  useProviderAppointmentActions,
  useStartBookedConsult,
} from '@/features/provider/use-provider';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { formatDateTime } from '@/lib/bangla-format';
import { confirmAction, showToast } from '@/lib/user-feedback';

const FOLLOW_UPS = [7, 14, 30, 90].map((d) => ({ value: d, label: `${toBanglaDigits(d)} দিন পর` }));

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

/** One visit: patient basics and what the provider does with it. */
export default function ProviderAppointmentScreen() {
  const { appointmentId } = useLocalSearchParams<{ appointmentId: string }>();
  const query = useProviderAppointment(appointmentId);
  const actions = useProviderAppointmentActions();
  const startConsult = useStartBookedConsult();
  const rx = usePrescriptionWriting();
  const [step, setStep] = useState<'view' | 'complete' | 'cancel'>('view');
  const [followUp, setFollowUp] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [openedAt] = useState(() => Date.now());
  const a = query.data;
  const fail = (e: unknown) => showToast(apiErrorMessage(e));

  const started = a ? Date.parse(a.scheduledAt) <= openedAt : false;
  const confirmed = a?.status === 'CONFIRMED';
  const online = a?.mode === 'VIDEO' || a?.mode === 'CHAT';
  const canOpenConsult = Boolean(a && confirmed && online && Date.parse(a.scheduledAt) - 15 * 60_000 <= openedAt);
  const canPrescribe = Boolean(a && (a.status === 'COMPLETED' || (confirmed && Date.parse(a.scheduledAt) - 60 * 60_000 <= openedAt)));

  return (
    <ScrollScreen
      header={<ScreenHeader title={a?.patient.fullName ?? 'অ্যাপয়েন্টমেন্ট'} subtitle={a?.code} fallbackHref="/provider/appointments" />}
      onRefresh={() => query.refetch()}>
      {query.isLoading ? (
        <SkeletonBlock className="h-72" />
      ) : query.isError || !a ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <SurfaceCard className="gap-0">
            <View className="flex-row items-center justify-between pb-2">
              <BanglaText variant="heading">{MODE_LABEL[a.mode]}</BanglaText>
              <StatusPill label={STATUS_LABEL[a.status]} tone={STATUS_TONE[a.status]} />
            </View>
            <Row label="রোগী" value={`${a.patient.fullName} (${a.patient.patientCode})`} />
            <Row
              label="বয়স ও লিঙ্গ"
              value={[a.patient.age !== null ? `${toBanglaDigits(a.patient.age)} বছর` : null, a.patient.gender === 'FEMALE' ? 'নারী' : a.patient.gender === 'MALE' ? 'পুরুষ' : 'অন্যান্য'].filter(Boolean).join(', ')}
            />
            <Row label="সময়" value={formatDateTime(a.estimatedAt ?? a.scheduledAt)} />
            {a.serialNo ? <Row label="সিরিয়াল" value={toBanglaDigits(a.serialNo)} /> : null}
            {a.chamber ? <Row label="চেম্বার" value={a.chamber.hospital.name} /> : null}
            <Row label="ফি" value={taka(a.fee)} />
            {a.patient.previousVisits > 0 ? <Row label="আগে দেখিয়েছেন" value={`${toBanglaDigits(a.patient.previousVisits)} বার`} /> : null}
            {a.reason ? <Row label="কারণ" value={a.reason} /> : null}
            {a.homeAddress ? <Row label="ঠিকানা" value={a.homeAddress} /> : null}
          </SurfaceCard>

          {a.status === 'PENDING_PAYMENT' ? <InlineAlert tone="info" message="রোগী এখনো পেমেন্ট করেননি।" /> : null}
          {a.cancelReason ? <InlineAlert tone="danger" message={`বাতিলের কারণ: ${a.cancelReason}`} /> : null}

          {step === 'view' ? (
            <View className="gap-3">
              {confirmed && online ? (
                <ActionButton
                  label={a.mode === 'VIDEO' ? 'ভিডিও পরামর্শ শুরু করুন' : 'চ্যাট শুরু করুন'}
                  icon={a.mode === 'VIDEO' ? Video : MessagesSquare}
                  disabled={!canOpenConsult}
                  loading={startConsult.isPending}
                  onPress={() =>
                    startConsult.mutate(a.id, {
                      onSuccess: (c) => router.push({ pathname: '/consultations/[consultationId]', params: { consultationId: c.id } }),
                      onError: fail,
                    })
                  }
                />
              ) : null}
              {confirmed && online && !canOpenConsult ? (
                <BanglaText variant="caption" className="text-center">নির্ধারিত সময়ের ১৫ মিনিট আগে থেকে শুরু করা যাবে।</BanglaText>
              ) : null}
              {canPrescribe ? (
                <ActionButton
                  label="প্রেসক্রিপশন"
                  variant="secondary"
                  icon={FileText}
                  loading={rx.start.isPending}
                  onPress={() =>
                    rx.start.mutate(
                      { appointmentId: a.id },
                      {
                        onSuccess: (p) => router.push({ pathname: '/provider/prescriptions/[prescriptionId]', params: { prescriptionId: p.id } }),
                        onError: fail,
                      }
                    )
                  }
                />
              ) : null}
              {confirmed ? (
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <ActionButton label="দেখা হয়েছে" variant="outline" icon={CheckCircle2} disabled={!started} onPress={() => setStep('complete')} />
                  </View>
                  <View className="flex-1">
                    <ActionButton
                      label="আসেননি"
                      variant="outline"
                      icon={UserX}
                      disabled={!started}
                      loading={actions.noShow.isPending}
                      onPress={() =>
                        void confirmAction({ title: 'রোগী আসেননি?', message: a.patient.fullName, confirmLabel: 'হ্যাঁ' }).then(
                          (ok) => ok && actions.noShow.mutate(a.id, { onSuccess: () => showToast('“আসেননি” লেখা হয়েছে'), onError: fail })
                        )
                      }
                    />
                  </View>
                </View>
              ) : null}
              {confirmed && !started ? <BanglaText variant="caption" className="text-center">ভিজিটের সময় হলে “দেখা হয়েছে” বা “আসেননি” চাপতে পারবেন।</BanglaText> : null}
              {confirmed || a.status === 'PENDING_PAYMENT' ? (
                <ActionButton label="বাতিল করুন" variant="ghost" icon={XCircle} onPress={() => setStep('cancel')} />
              ) : null}
            </View>
          ) : step === 'complete' ? (
            <SurfaceCard className="gap-3">
              <BanglaText variant="body-strong">আবার আসতে বলবেন?</BanglaText>
              <ChipSelect options={FOLLOW_UPS} value={followUp} onChange={(v) => setFollowUp(followUp === v ? null : v)} />
              {followUp ? (
                <LabeledTextInput label="ফলো-আপের নোট (ঐচ্ছিক)" placeholder="যেমন: CBC রিপোর্ট নিয়ে আসবেন" value={note} onChangeText={setNote} maxLength={300} />
              ) : null}
              <BanglaText variant="caption">দিন বেছে নিলে রোগীর পরিবারকে ২৪ আর ২ ঘণ্টা আগে মনে করানো হবে।</BanglaText>
              <ActionButton
                label="সম্পন্ন করুন"
                icon={CheckCircle2}
                loading={actions.complete.isPending}
                onPress={() =>
                  actions.complete.mutate(
                    { id: a.id, body: { followUpInDays: followUp ?? undefined, followUpNote: note.trim() || undefined } },
                    { onSuccess: () => { showToast('দেখা হয়েছে'); setStep('view'); }, onError: fail }
                  )
                }
              />
              <ActionButton label="পেছনে" variant="ghost" onPress={() => setStep('view')} />
            </SurfaceCard>
          ) : (
            <SurfaceCard className="gap-3">
              <LabeledTextInput label="বাতিলের কারণ" placeholder="যেমন: জরুরি অপারেশনে আছি" value={reason} onChangeText={setReason} maxLength={200} helperText="রোগী SMS আর নোটিফিকেশনে জানবেন; পেমেন্ট করা থাকলে টাকা ফেরত যাবে।" />
              <ActionButton
                label="বাতিল নিশ্চিত করুন"
                variant="danger"
                icon={XCircle}
                disabled={reason.trim().length < 3}
                loading={actions.cancel.isPending}
                onPress={() =>
                  actions.cancel.mutate(
                    { id: a.id, reason: reason.trim() },
                    { onSuccess: () => { showToast('বাতিল হয়েছে'); setStep('view'); }, onError: fail }
                  )
                }
              />
              <ActionButton label="পেছনে" variant="ghost" onPress={() => setStep('view')} />
            </SurfaceCard>
          )}
        </>
      )}
    </ScrollScreen>
  );
}
