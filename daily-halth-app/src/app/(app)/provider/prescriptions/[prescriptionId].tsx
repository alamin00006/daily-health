import { useLocalSearchParams } from 'expo-router';
import { Ban } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { apiErrorMessage } from '@/api/api-error-messages';
import { PrescriptionEditor } from '@/components/provider/prescription-editor';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { InlineAlert } from '@/components/ui/form-error-banner';
import { LabeledTextInput } from '@/components/ui/labeled-text-input';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { ErrorState, SkeletonBlock } from '@/components/ui/state-views';
import { StatusPill } from '@/components/ui/status-pill';
import { SurfaceCard } from '@/components/ui/surface-card';
import { DOSE_UNIT_LABELS, MEAL_TIMING_LABELS } from '@/features/medicine/medicine-display';
import { PRESCRIPTION_STATUS_LABEL, PRESCRIPTION_STATUS_TONE } from '@/features/provider/provider-display';
import { usePrescriptionWriting, useProviderPrescription } from '@/features/provider/use-provider';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { formatDateTime } from '@/lib/bangla-format';
import { showToast } from '@/lib/user-feedback';
import type { PrescriptionResponse } from '@/shared-contracts/prescription.contract';

function IssuedView({ p }: { p: PrescriptionResponse }) {
  const rx = usePrescriptionWriting();
  const [revoking, setRevoking] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <View className="gap-4">
      {p.status === 'REVOKED' ? (
        <InlineAlert tone="danger" message={`বাতিল${p.revokeReason ? `: ${p.revokeReason}` : ''}`} />
      ) : null}
      <SurfaceCard className="gap-3">
        {p.chiefComplaint ? <BanglaText><BanglaText variant="label" className="text-primary">সমস্যা: </BanglaText>{p.chiefComplaint}</BanglaText> : null}
        {p.diagnosis ? <BanglaText><BanglaText variant="label" className="text-primary">রোগ নির্ণয়: </BanglaText>{p.diagnosis}</BanglaText> : null}
        {p.items.map((i, n) => (
          <View key={i.id} className="border-t border-line/60 pt-2">
            <BanglaText variant="body-strong">
              {toBanglaDigits(n + 1)}. {i.medicineName} {i.strength ?? ''}
            </BanglaText>
            <BanglaText variant="caption" className="text-ink">
              {toBanglaDigits(i.dosePattern)} {DOSE_UNIT_LABELS[i.doseUnit]} · {MEAL_TIMING_LABELS[i.mealTiming]} ·{' '}
              {i.durationDays ? `${toBanglaDigits(i.durationDays)} দিন` : 'চলবে'}
              {i.instruction ? ` · ${i.instruction}` : ''}
            </BanglaText>
          </View>
        ))}
        {p.tests.length ? <BanglaText variant="caption" className="text-ink">পরীক্ষা: {p.tests.map((t) => t.testName).join(', ')}</BanglaText> : null}
        {p.advice ? <BanglaText><BanglaText variant="label" className="text-primary">উপদেশ: </BanglaText>{p.advice}</BanglaText> : null}
        {p.followUpAfterDays ? <BanglaText variant="body-strong">{toBanglaDigits(p.followUpAfterDays)} দিন পর আবার দেখা করবেন</BanglaText> : null}
      </SurfaceCard>
      {p.status === 'ISSUED' ? (
        revoking ? (
          <SurfaceCard className="gap-3">
            <LabeledTextInput label="বাতিলের কারণ" placeholder="যেমন: ডোজ ভুল লেখা হয়েছিল" value={reason} onChangeText={setReason} maxLength={300} helperText="রোগী নোটিফিকেশনে কারণ জানবেন। পরে নতুন লিখতে পারবেন।" />
            <ActionButton
              label="বাতিল নিশ্চিত করুন"
              variant="danger"
              icon={Ban}
              disabled={reason.trim().length < 3}
              loading={rx.revoke.isPending}
              onPress={() =>
                rx.revoke.mutate(
                  { id: p.id, reason: reason.trim() },
                  { onSuccess: () => { setRevoking(false); showToast('বাতিল হয়েছে'); }, onError: (e) => showToast(apiErrorMessage(e)) }
                )
              }
            />
            <ActionButton label="পেছনে" variant="ghost" onPress={() => setRevoking(false)} />
          </SurfaceCard>
        ) : (
          <ActionButton label="প্রেসক্রিপশন বাতিল করুন" variant="ghost" icon={Ban} onPress={() => setRevoking(true)} />
        )
      ) : null}
    </View>
  );
}

/** A draft (editable) or an issued / revoked prescription. */
export default function ProviderPrescriptionScreen() {
  const { prescriptionId } = useLocalSearchParams<{ prescriptionId: string }>();
  const query = useProviderPrescription(prescriptionId);
  const p = query.data;
  return (
    <ScrollScreen
      header={
        <ScreenHeader
          title={p ? p.patient.fullName : 'প্রেসক্রিপশন'}
          subtitle={p ? `${p.code}${p.issuedAt ? ` · ${formatDateTime(p.issuedAt)}` : ''}` : undefined}
          fallbackHref="/provider/prescriptions"
          actions={p ? <StatusPill label={PRESCRIPTION_STATUS_LABEL[p.status]} tone={PRESCRIPTION_STATUS_TONE[p.status]} /> : null}
        />
      }>
      {query.isLoading ? (
        <SkeletonBlock className="h-96" />
      ) : query.isError || !p ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : p.status === 'DRAFT' ? (
        <PrescriptionEditor key={p.id} prescription={p} />
      ) : (
        <IssuedView p={p} />
      )}
    </ScrollScreen>
  );
}
