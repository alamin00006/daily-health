import { router, useLocalSearchParams } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ChipSelect } from '@/components/ui/chip-select';
import { DateField, TimeField } from '@/components/ui/date-time-field';
import { FormErrorBanner } from '@/components/ui/form-error-banner';
import { LabeledTextInput } from '@/components/ui/labeled-text-input';
import { ScreenContainer } from '@/components/ui/screen-container';
import { ScreenHeader } from '@/components/ui/screen-header';
import { apiErrorMessage } from '@/api/api-error-messages';
import {
  GLUCOSE_CONTEXT_LABELS,
  VITAL_META,
  VITAL_STATUS_META,
  VITAL_TYPES,
} from '@/features/health/health-display';
import { useAddVital } from '@/features/health/use-health';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { toAsciiDigits, toBanglaDigits } from '@/lib/bangla-digits';
import { dhakaDate, dhakaTime } from '@/lib/bangla-format';
import { showToast } from '@/lib/user-feedback';
import type {
  CreateVitalRequest,
  VitalContext,
  VitalType,
} from '@/shared-contracts/health.contract';

const TYPE_OPTIONS = VITAL_TYPES.map((value) => ({ value, label: VITAL_META[value].shortLabel }));
const CONTEXT_OPTIONS = (Object.keys(GLUCOSE_CONTEXT_LABELS) as VitalContext[]).map((value) => ({
  value,
  label: GLUCOSE_CONTEXT_LABELS[value],
}));

/** Allowed ranges, same as the API contract (health.contract.ts). */
const RANGES: Record<Exclude<VitalType, 'BP'>, { min: number; max: number; whole: boolean }> = {
  GLUCOSE: { min: 1, max: 40, whole: false },
  WEIGHT: { min: 1, max: 300, whole: false },
  PULSE: { min: 20, max: 250, whole: true },
  TEMP: { min: 30, max: 45, whole: false },
  SPO2: { min: 50, max: 100, whole: true },
};

function parse(text: string): number | null {
  const value = toAsciiDigits(text).replace(',', '.').trim();
  return /^\d+(\.\d+)?$/.test(value) ? Number(value) : null;
}

export default function NewVitalScreen() {
  const params = useLocalSearchParams<{ type?: VitalType }>();
  const { profile } = useActiveProfile();
  const add = useAddVital(profile?.id ?? '');

  const [type, setType] = useState<VitalType>(
    params.type && VITAL_TYPES.includes(params.type) ? params.type : 'BP'
  );
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [value, setValue] = useState('');
  const [context, setContext] = useState<VitalContext | null>(null);
  const [date, setDate] = useState(dhakaDate());
  const [time, setTime] = useState(dhakaTime(new Date()));
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const meta = VITAL_META[type];

  const build = (): CreateVitalRequest | null => {
    const next: Record<string, string> = {};
    const measuredAt = new Date(Date.parse(`${date}T${time}:00+06:00`));
    if (measuredAt.getTime() > Date.now() + 5 * 60_000)
      next.time = 'ভবিষ্যতের সময় দেওয়া যাবে না।';
    const common = {
      measuredAt: measuredAt.toISOString(),
      ...(note.trim() ? { note: note.trim().slice(0, 500) } : {}),
    };

    if (type === 'BP') {
      const s = parse(systolic);
      const d = parse(diastolic);
      if (s === null || s < 50 || s > 260 || !Number.isInteger(s))
        next.systolic = '৫০ থেকে ২৬০-এর মধ্যে লিখুন।';
      if (d === null || d < 30 || d > 160 || !Number.isInteger(d))
        next.diastolic = '৩০ থেকে ১৬০-এর মধ্যে লিখুন।';
      if (s !== null && d !== null && s <= d)
        next.diastolic = 'নিচের সংখ্যা উপরেরটির চেয়ে কম হবে।';
      setErrors(next);
      return Object.keys(next).length ? null : { type, systolic: s!, diastolic: d!, ...common };
    }

    const range = RANGES[type];
    const raw = parse(value);
    const amount = raw === null ? null : range.whole ? Math.round(raw) : Math.round(raw * 10) / 10;
    if (amount === null || amount < range.min || amount > range.max) {
      next.value = toBanglaDigits(`${range.min} থেকে ${range.max}-এর মধ্যে লিখুন।`);
    }
    if (type === 'GLUCOSE' && !context) next.context = 'কখন মেপেছেন বেছে নিন।';
    setErrors(next);
    if (Object.keys(next).length) return null;
    return type === 'GLUCOSE'
      ? { type, value: amount!, context: context!, ...common }
      : ({ type, value: amount!, ...common } as CreateVitalRequest);
  };

  const submit = () => {
    const body = build();
    if (!body) return;
    add.mutate(body, {
      onSuccess: (reading) => {
        const status = reading.status ? ` · ${VITAL_STATUS_META[reading.status].label}` : '';
        showToast(`সেভ হয়েছে${status}`);
        router.back();
      },
    });
  };

  return (
    <ScreenContainer
      header={
        <ScreenHeader
          title="নতুন মাপ"
          subtitle={profile?.fullName}
          backIcon="close"
          fallbackHref="/vitals"
        />
      }
      footer={
        <ActionButton label="সেভ করুন" icon={Check} loading={add.isPending} onPress={submit} />
      }>
      <ChipSelect
        label="কী মেপেছেন?"
        options={TYPE_OPTIONS}
        value={type}
        onChange={(next) => {
          setType(next);
          setErrors({});
        }}
        scroll
      />

      {type === 'BP' ? (
        <View className="flex-row gap-3">
          <View className="flex-1">
            <LabeledTextInput
              label="উপরের (সিস্টোলিক)"
              value={systolic}
              onChangeText={setSystolic}
              placeholder="১২০"
              keyboardType="number-pad"
              maxLength={3}
              autoFocus
              errorText={errors.systolic}
            />
          </View>
          <View className="flex-1">
            <LabeledTextInput
              label="নিচের (ডায়াস্টোলিক)"
              value={diastolic}
              onChangeText={setDiastolic}
              placeholder="৮০"
              keyboardType="number-pad"
              maxLength={3}
              errorText={errors.diastolic}
            />
          </View>
        </View>
      ) : (
        <LabeledTextInput
          label={`${meta.label} (${meta.unit})`}
          value={value}
          onChangeText={setValue}
          placeholder={meta.hint}
          keyboardType={RANGES[type].whole ? 'number-pad' : 'decimal-pad'}
          maxLength={6}
          autoFocus
          helperText={
            type === 'GLUCOSE' ? 'mg/dL দেখালে ১৮ দিয়ে ভাগ করুন (যেমন ১২৬ ÷ ১৮ = ৭.০)।' : undefined
          }
          errorText={errors.value}
        />
      )}

      {type === 'GLUCOSE' ? (
        <ChipSelect
          label="কখন মেপেছেন?"
          options={CONTEXT_OPTIONS}
          value={context}
          onChange={setContext}
          errorText={errors.context}
        />
      ) : null}

      <View className="flex-row gap-3">
        <View className="flex-1">
          <DateField
            label="তারিখ"
            value={date}
            onChange={(d) => d && setDate(d)}
            maximumDate={new Date()}
          />
        </View>
        <View className="flex-1">
          <TimeField label="সময়" value={time} onChange={setTime} errorText={errors.time} />
        </View>
      </View>

      <LabeledTextInput
        label="নোট (ঐচ্ছিক)"
        value={note}
        onChangeText={setNote}
        placeholder="যেমন: ওষুধ খাওয়ার আগে মাপা"
        maxLength={500}
        multiline
      />

      <FormErrorBanner message={add.error ? apiErrorMessage(add.error) : null} />
      <BanglaText variant="caption" className="text-ink-subtle">
        সেভ করলে অবস্থা (স্বাভাবিক, বেশি, কম) নিজে থেকে দেখাবে।
      </BanglaText>
    </ScreenContainer>
  );
}
