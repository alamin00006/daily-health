import { router, useLocalSearchParams } from 'expo-router';
import { AlarmClock, BellRing, FilePlus2, FileText, FlaskConical, Link2, Paperclip } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { isApiError } from '@/api/api-error';
import { apiErrorMessage } from '@/api/api-error-messages';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { InlineAlert } from '@/components/ui/form-error-banner';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { ErrorState, SkeletonBlock } from '@/components/ui/state-views';
import { SurfaceCard } from '@/components/ui/surface-card';
import { DOSE_UNIT_LABELS, MEAL_TIMING_LABELS, doseText } from '@/features/medicine/medicine-display';
import { useCreateAlarmFromItem, useLinkTestResult, usePrescription } from '@/features/prescriptions/use-prescriptions';
import { canEdit } from '@/features/profiles/profile-permissions';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { useMedicalFiles } from '@/features/records/use-records';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { banglaClock, formatDateTime } from '@/lib/bangla-format';
import { showToast } from '@/lib/user-feedback';
import {
  doseTimesFromPattern,
  type PrescribedTestResponse,
  type PrescriptionItemResponse,
  type PrescriptionResponse,
} from '@/shared-contracts/prescription.contract';
import { colors } from '@/theme/design-tokens';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-1">
      <BanglaText variant="label" className="text-primary">
        {title}
      </BanglaText>
      {children}
    </View>
  );
}

/** "সকাল ৮:০০ ১টি ট্যাবলেট · রাত ৯:০০ ½টি ট্যাবলেট" */
function alarmPreview(item: PrescriptionItemResponse): string {
  const times = doseTimesFromPattern(item.dosePattern) ?? [];
  return times.map((t) => `${banglaClock(t.time)} ${doseText(t.dose, item.doseUnit)}`).join(' · ');
}

function MedicineRow({
  item,
  index,
  p,
  profileId,
  editable,
}: {
  item: PrescriptionItemResponse;
  index: number;
  p: PrescriptionResponse;
  profileId: string;
  editable: boolean;
}) {
  const create = useCreateAlarmFromItem(profileId, p.id);
  const active = item.alarm?.isActive;
  const openPlan = (planId: string) =>
    router.push({ pathname: '/plans/[planId]', params: { planId } });

  return (
    <View className="gap-2 border-t border-line/60 pt-3">
      <BanglaText variant="body-strong">
        {toBanglaDigits(index + 1)}. {item.medicineName}
        {item.strength ? ` ${item.strength}` : ''}
      </BanglaText>
      <BanglaText variant="caption" className="text-ink">
        <BanglaText className="font-bangla-semibold text-[15px] text-ink">{toBanglaDigits(item.dosePattern)}</BanglaText>{' '}
        {DOSE_UNIT_LABELS[item.doseUnit]} · {MEAL_TIMING_LABELS[item.mealTiming]} ·{' '}
        {item.durationDays ? `${toBanglaDigits(item.durationDays)} দিন` : 'চলবে'}
      </BanglaText>
      {item.instruction ? <BanglaText variant="caption">{item.instruction}</BanglaText> : null}
      {p.status === 'ISSUED' ? (
        active ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => openPlan(item.alarm!.planId)}
            className="flex-row items-center gap-2 self-start rounded-full bg-success-soft px-3 py-1.5">
            <BellRing size={16} color={colors.success} />
            <BanglaText className="font-bangla-medium text-[13px] text-success">অ্যালার্ম চালু আছে · দেখুন</BanglaText>
          </Pressable>
        ) : editable ? (
          <View className="gap-1">
            <ActionButton
              label="অ্যালার্ম চালু করুন"
              size="sm"
              variant="secondary"
              icon={AlarmClock}
              loading={create.isPending}
              onPress={() =>
                create.mutate(item.id, {
                  onSuccess: () => showToast('অ্যালার্ম চালু হয়েছে। সময় বদলাতে চাইলে অ্যালার্মে যান।'),
                  onError: (e) => {
                    const planId =
                      isApiError(e) && e.code === 'ALARM_ALREADY_CREATED'
                        ? (e.details as { planId?: string } | null)?.planId
                        : null;
                    if (planId) openPlan(planId);
                    else showToast(apiErrorMessage(e));
                  },
                })
              }
            />
            <BanglaText variant="caption">{alarmPreview(item)}</BanglaText>
          </View>
        ) : null
      ) : null}
    </View>
  );
}

function TestRow({
  test,
  p,
  profileId,
  editable,
}: {
  test: PrescribedTestResponse;
  p: PrescriptionResponse;
  profileId: string;
  editable: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const files = useMedicalFiles(picking ? profileId : undefined, 'LAB_REPORT');
  const link = useLinkTestResult(profileId, p.id);
  const options = files.data?.pages.flatMap((page) => page.data).slice(0, 8) ?? [];

  return (
    <View className="gap-2 border-t border-line/60 pt-3">
      <View className="flex-row items-center gap-2">
        <FlaskConical size={18} color={colors.primary} />
        <BanglaText variant="body-strong" className="flex-1">
          {test.testName}
        </BanglaText>
      </View>
      {test.note ? <BanglaText variant="caption">{test.note}</BanglaText> : null}
      {test.resultFile ? (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({ pathname: '/records/[fileId]', params: { fileId: test.resultFile!.id } })
          }
          className="flex-row items-center gap-2 self-start rounded-full bg-primary-50 px-3 py-1.5">
          <Paperclip size={16} color={colors.primary} />
          <BanglaText className="font-bangla-medium text-[13px] text-primary">{test.resultFile.title}</BanglaText>
        </Pressable>
      ) : editable ? (
        picking ? (
          <View className="gap-2 rounded-2xl bg-surface p-3">
            <BanglaText variant="caption">কোন রিপোর্টটি এই টেস্টের?</BanglaText>
            {files.isLoading ? <SkeletonBlock className="h-10" /> : null}
            {options.map((file) => (
              <Pressable
                key={file.id}
                accessibilityRole="button"
                onPress={() =>
                  link.mutate(
                    { testId: test.id, fileId: file.id },
                    {
                      onSuccess: () => {
                        setPicking(false);
                        showToast('রিপোর্ট যুক্ত হয়েছে');
                      },
                      onError: (e) => showToast(apiErrorMessage(e)),
                    }
                  )
                }
                className="flex-row items-center gap-2 rounded-xl bg-surface-card px-3 py-2.5 active:bg-primary-50">
                <FileText size={16} color={colors.primary} />
                <BanglaText className="flex-1" numberOfLines={1}>
                  {file.title}
                </BanglaText>
              </Pressable>
            ))}
            {!files.isLoading && options.length === 0 ? (
              <BanglaText variant="caption">এখনো কোনো ল্যাব রিপোর্ট আপলোড করা হয়নি।</BanglaText>
            ) : null}
            <View className="flex-row gap-2">
              <ActionButton label="নতুন আপলোড" size="sm" variant="outline" icon={FilePlus2} onPress={() => router.push('/records/upload')} />
              <ActionButton label="বাতিল" size="sm" variant="ghost" onPress={() => setPicking(false)} />
            </View>
          </View>
        ) : (
          <ActionButton label="রিপোর্ট যুক্ত করুন" size="sm" variant="outline" icon={Link2} onPress={() => setPicking(true)} />
        )
      ) : null}
    </View>
  );
}

/** One prescription: medicines (one tap → alarm), tests (link the report) and advice. */
export default function PrescriptionScreen() {
  const { prescriptionId, profileId: profileParam } = useLocalSearchParams<{
    prescriptionId: string;
    profileId?: string;
  }>();
  const { profile, profiles } = useActiveProfile();
  const owner = profiles.find((x) => x.id === profileParam) ?? profile;
  const query = usePrescription(owner?.id, prescriptionId);
  const p = query.data;
  const editable = canEdit(owner);

  return (
    <ScrollScreen
      header={<ScreenHeader title="প্রেসক্রিপশন" subtitle={p?.code} fallbackHref="/prescriptions" />}
      onRefresh={() => query.refetch()}>
      {query.isLoading ? (
        <>
          <SkeletonBlock className="h-28" />
          <SkeletonBlock className="h-64" />
        </>
      ) : query.isError || !p || !owner ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          {p.status === 'REVOKED' ? (
            <InlineAlert
              tone="danger"
              message={`ডাক্তার এটি বাতিল করেছেন${p.revokeReason ? `: ${p.revokeReason}` : ''}। এর থেকে চালু করা অ্যালার্ম থাকলে ওষুধের পাতা থেকে বন্ধ করুন।`}
            />
          ) : null}
          <SurfaceCard className="gap-1">
            <BanglaText variant="heading">{p.provider ? `ডা. ${p.provider.displayName}` : 'ডাক্তার'}</BanglaText>
            {p.provider ? (
              <BanglaText variant="caption">
                {p.provider.qualifications}
                {p.provider.bmdcNo ? ` · BMDC ${p.provider.bmdcNo}` : ''}
              </BanglaText>
            ) : null}
            <BanglaText variant="caption">
              {p.patient.fullName} · {p.issuedAt ? formatDateTime(p.issuedAt) : ''}
            </BanglaText>
          </SurfaceCard>

          {p.chiefComplaint || p.diagnosis ? (
            <SurfaceCard className="gap-3">
              {p.chiefComplaint ? (
                <Section title="সমস্যা">
                  <BanglaText>{p.chiefComplaint}</BanglaText>
                </Section>
              ) : null}
              {p.diagnosis ? (
                <Section title="রোগ নির্ণয়">
                  <BanglaText>{p.diagnosis}</BanglaText>
                </Section>
              ) : null}
            </SurfaceCard>
          ) : null}

          {p.items.length ? (
            <SurfaceCard className="gap-0">
              <BanglaText variant="heading" className="pb-2">
                ওষুধ
              </BanglaText>
              {p.items.map((item, index) => (
                <View key={item.id} className="pb-3">
                  <MedicineRow item={item} index={index} p={p} profileId={owner.id} editable={editable} />
                </View>
              ))}
            </SurfaceCard>
          ) : null}

          {p.tests.length ? (
            <SurfaceCard className="gap-0">
              <BanglaText variant="heading" className="pb-2">
                পরীক্ষা
              </BanglaText>
              {p.tests.map((test) => (
                <View key={test.id} className="pb-3">
                  <TestRow test={test} p={p} profileId={owner.id} editable={editable} />
                </View>
              ))}
            </SurfaceCard>
          ) : null}

          {p.advice || p.followUpAfterDays ? (
            <SurfaceCard className="gap-3">
              {p.advice ? (
                <Section title="উপদেশ">
                  <BanglaText>{p.advice}</BanglaText>
                </Section>
              ) : null}
              {p.followUpAfterDays ? (
                <BanglaText variant="body-strong">
                  {toBanglaDigits(p.followUpAfterDays)} দিন পর আবার দেখা করবেন
                </BanglaText>
              ) : null}
            </SurfaceCard>
          ) : null}
        </>
      )}
    </ScrollScreen>
  );
}
