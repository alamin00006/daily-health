import { router, useLocalSearchParams } from 'expo-router';
import { Check, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ChipSelect } from '@/components/ui/chip-select';
import { DateField } from '@/components/ui/date-time-field';
import { FormErrorBanner } from '@/components/ui/form-error-banner';
import { LabeledTextInput } from '@/components/ui/labeled-text-input';
import { ScreenContainer } from '@/components/ui/screen-container';
import { ScreenHeader } from '@/components/ui/screen-header';
import { apiErrorMessage } from '@/api/api-error-messages';
import { CONDITION_KIND_META } from '@/features/health/health-display';
import { useConditions, useRemoveCondition, useSaveCondition } from '@/features/health/use-health';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { confirmAction, showToast } from '@/lib/user-feedback';
import type { ConditionKind } from '@/shared-contracts/health.contract';

const KIND_OPTIONS = (Object.keys(CONDITION_KIND_META) as ConditionKind[]).map((value) => ({
  value,
  label: CONDITION_KIND_META[value].label,
}));

/** One tap for the most common entries, so elderly users type less. */
const SUGGESTIONS: Record<ConditionKind, string[]> = {
  CHRONIC: [
    'ডায়াবেটিস',
    'উচ্চ রক্তচাপ',
    'হৃদরোগ',
    'হাঁপানি',
    'কিডনির সমস্যা',
    'থাইরয়েড',
    'বাত / আর্থ্রাইটিস',
  ],
  ALLERGY: ['পেনিসিলিন', 'সালফা ওষুধ', 'অ্যাসপিরিন', 'চিংড়ি', 'ডিম', 'ধুলাবালি'],
  SURGERY: ['চোখের ছানি', 'অ্যাপেনডিক্স', 'সিজারিয়ান', 'হার্টের রিং / বাইপাস', 'পিত্তথলি'],
};

export default function ConditionFormScreen() {
  const { conditionId } = useLocalSearchParams<{ conditionId?: string }>();
  const { profile } = useActiveProfile();
  const conditions = useConditions(profile?.id);
  const existing = conditions.data?.find((c) => c.id === conditionId);
  const save = useSaveCondition(profile?.id ?? '');
  const remove = useRemoveCondition(profile?.id ?? '');

  const [kind, setKind] = useState<ConditionKind>(existing?.kind ?? 'CHRONIC');
  const [name, setName] = useState(existing?.name ?? '');
  const [since, setSince] = useState<string | null>(existing?.since ?? null);
  const [note, setNote] = useState(existing?.note ?? '');
  const [nameError, setNameError] = useState<string | null>(null);

  const submit = () => {
    if (!name.trim()) {
      setNameError('নাম লিখুন।');
      return;
    }
    save.mutate(
      {
        conditionId: existing?.id,
        body: { kind, name: name.trim(), since, note: note.trim() || null },
      },
      {
        onSuccess: () => {
          showToast('সেভ হয়েছে');
          router.back();
        },
      }
    );
  };

  return (
    <ScreenContainer
      header={
        <ScreenHeader
          title={existing ? 'তথ্য বদলান' : 'নতুন যোগ করুন'}
          subtitle={profile?.fullName}
          backIcon="close"
          fallbackHref="/conditions"
        />
      }
      footer={
        <ActionButton label="সেভ করুন" icon={Check} loading={save.isPending} onPress={submit} />
      }>
      <ChipSelect label="কী ধরনের?" options={KIND_OPTIONS} value={kind} onChange={setKind} />

      <LabeledTextInput
        label={
          kind === 'ALLERGY'
            ? 'কিসে অ্যালার্জি?'
            : kind === 'SURGERY'
              ? 'কিসের অপারেশন?'
              : 'রোগের নাম'
        }
        value={name}
        onChangeText={(text) => {
          setName(text);
          setNameError(null);
        }}
        placeholder={SUGGESTIONS[kind][0]}
        maxLength={120}
        errorText={nameError}
      />
      {!existing ? (
        <View className="flex-row flex-wrap gap-2">
          {SUGGESTIONS[kind].map((suggestion) => (
            <Pressable
              key={suggestion}
              accessibilityRole="button"
              onPress={() => {
                setName(suggestion);
                setNameError(null);
              }}
              className="min-h-touch justify-center rounded-full bg-primary-50 px-3.5 active:bg-primary-100">
              <BanglaText variant="label" className="text-primary-700">
                {suggestion}
              </BanglaText>
            </Pressable>
          ))}
        </View>
      ) : null}

      <DateField
        label={kind === 'SURGERY' ? 'কবে হয়েছিল (ঐচ্ছিক)' : 'কবে থেকে (ঐচ্ছিক)'}
        value={since}
        onChange={setSince}
        maximumDate={new Date()}
        minimumDate={new Date(1900, 0, 1)}
        clearable
      />

      <LabeledTextInput
        label="নোট (ঐচ্ছিক)"
        value={note}
        onChangeText={setNote}
        placeholder={kind === 'ALLERGY' ? 'যেমন: শরীরে র‍্যাশ হয়' : 'যেমন: কোন ওষুধ চলছে'}
        maxLength={1000}
        multiline
      />

      <FormErrorBanner message={save.error ? apiErrorMessage(save.error) : null} />

      {existing ? (
        <ActionButton
          label="মুছে ফেলুন"
          icon={Trash2}
          variant="danger"
          size="sm"
          loading={remove.isPending}
          onPress={async () => {
            const ok = await confirmAction({
              title: `"${existing.name}" মুছবেন?`,
              message: 'এটি আর ফেরানো যাবে না।',
              confirmLabel: 'মুছে ফেলুন',
              destructive: true,
            });
            if (!ok) return;
            remove.mutate(existing.id, {
              onSuccess: () => router.back(),
              onError: (error) => showToast(apiErrorMessage(error)),
            });
          }}
        />
      ) : null}
    </ScreenContainer>
  );
}
