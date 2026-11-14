import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { FlaskConical, Pill, Plus, Save, Send, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch, type Control } from 'react-hook-form';
import { Pressable, View } from 'react-native';
import { z } from 'zod';

import { apiErrorMessage } from '@/api/api-error-messages';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ChipSelect } from '@/components/ui/chip-select';
import { LabeledTextInput } from '@/components/ui/labeled-text-input';
import { SurfaceCard } from '@/components/ui/surface-card';
import { DOSE_UNIT_LABELS, MEAL_TIMING_LABELS, doseText } from '@/features/medicine/medicine-display';
import { useMedicineCatalogSearch, usePrescriptionWriting } from '@/features/provider/use-provider';
import { toAsciiDigits, toBanglaDigits } from '@/lib/bangla-digits';
import { banglaClock } from '@/lib/bangla-format';
import { confirmAction, showToast } from '@/lib/user-feedback';
import {
  doseUnitSchema,
  mealTimingSchema,
  medicineFormSchema,
  type DoseUnit,
  type MealTiming,
  type MedicineForm,
} from '@/shared-contracts/medicine.contract';
import {
  doseTimesFromPattern,
  parseDosePattern,
  type PrescriptionResponse,
  type SavePrescriptionDraftRequest,
} from '@/shared-contracts/prescription.contract';
import { colors } from '@/theme/design-tokens';

const FORM_LABEL: Record<MedicineForm, string> = {
  TABLET: 'ট্যাবলেট', CAPSULE: 'ক্যাপসুল', SYRUP: 'সিরাপ', SUSPENSION: 'সাসপেনশন', DROPS: 'ড্রপ',
  INJECTION: 'ইনজেকশন', INSULIN: 'ইনসুলিন', INHALER: 'ইনহেলার', CREAM: 'ক্রিম', OINTMENT: 'মলম',
  GEL: 'জেল', SUPPOSITORY: 'সাপোজিটরি', POWDER: 'পাউডার', OTHER: 'অন্যান্য',
};
const DEFAULT_UNIT: Record<MedicineForm, DoseUnit> = {
  TABLET: 'TABLET', CAPSULE: 'CAPSULE', SYRUP: 'SPOON', SUSPENSION: 'SPOON', DROPS: 'DROP', INJECTION: 'ML',
  INSULIN: 'UNIT', INHALER: 'PUFF', CREAM: 'APPLICATION', OINTMENT: 'APPLICATION', GEL: 'APPLICATION',
  SUPPOSITORY: 'UNIT', POWDER: 'SACHET', OTHER: 'UNIT',
};
const FORMS = (Object.keys(FORM_LABEL) as MedicineForm[]).map((value) => ({ value, label: FORM_LABEL[value] }));
const UNITS = (Object.keys(DOSE_UNIT_LABELS) as DoseUnit[]).map((value) => ({ value, label: DOSE_UNIT_LABELS[value] }));
const MEALS = (Object.keys(MEAL_TIMING_LABELS) as MealTiming[]).map((value) => ({ value, label: MEAL_TIMING_LABELS[value] }));
const PATTERNS = ['1+0+0', '0+0+1', '1+0+1', '1+1+1', '½+0+½'].map((value) => ({ value, label: toBanglaDigits(value) }));

const days = z
  .string()
  .trim()
  .refine((v) => v === '' || (/^\d+$/.test(toAsciiDigits(v)) && Number(toAsciiDigits(v)) >= 1 && Number(toAsciiDigits(v)) <= 365), '১ থেকে ৩৬৫ দিন');

const schema = z.object({
  chiefComplaint: z.string().trim().max(1000),
  diagnosis: z.string().trim().max(1000),
  advice: z.string().trim().max(2000),
  followUpAfterDays: days,
  items: z
    .array(
      z.object({
        medicineId: z.string().optional(),
        medicineName: z.string().trim().min(1, 'ওষুধের নাম লিখুন').max(80),
        strength: z.string().trim().max(40),
        form: medicineFormSchema,
        doseUnit: doseUnitSchema,
        dosePattern: z.string().trim().refine((v) => parseDosePattern(v) !== null, 'যেমন ১+০+১ বা ১+০+½'),
        mealTiming: mealTimingSchema,
        durationDays: days,
        instruction: z.string().trim().max(300),
      })
    )
    .max(20),
  tests: z.array(z.object({ testName: z.string().trim().min(2, 'টেস্টের নাম লিখুন').max(80), note: z.string().trim().max(300) })).max(20),
});
type Values = z.infer<typeof schema>;

const NEW_ITEM: Values['items'][number] = {
  medicineName: '', strength: '', form: 'TABLET', doseUnit: 'TABLET', dosePattern: '1+0+1', mealTiming: 'AFTER_MEAL', durationDays: '7', instruction: '',
};

const num = (v: string) => (v.trim() ? Number(toAsciiDigits(v.trim())) : null);

function toValues(p: PrescriptionResponse): Values {
  return {
    chiefComplaint: p.chiefComplaint ?? '',
    diagnosis: p.diagnosis ?? '',
    advice: p.advice ?? '',
    followUpAfterDays: p.followUpAfterDays ? String(p.followUpAfterDays) : '',
    items: p.items.map((i) => ({
      medicineId: i.medicineId ?? undefined,
      medicineName: i.medicineName,
      strength: i.strength ?? '',
      form: i.form,
      doseUnit: i.doseUnit,
      dosePattern: i.dosePattern,
      mealTiming: i.mealTiming,
      durationDays: i.durationDays ? String(i.durationDays) : '',
      instruction: i.instruction ?? '',
    })),
    tests: p.tests.map((t) => ({ testName: t.testName, note: t.note ?? '' })),
  };
}

function toRequest(v: Values): SavePrescriptionDraftRequest {
  return {
    chiefComplaint: v.chiefComplaint || undefined,
    diagnosis: v.diagnosis || undefined,
    advice: v.advice || undefined,
    followUpAfterDays: num(v.followUpAfterDays),
    items: v.items.map((i) => ({
      medicineId: i.medicineId || undefined,
      medicineName: i.medicineName,
      strength: i.strength || undefined,
      form: i.form,
      doseUnit: i.doseUnit,
      dosePattern: i.dosePattern,
      mealTiming: i.mealTiming,
      durationDays: num(i.durationDays),
      instruction: i.instruction || undefined,
    })),
    tests: v.tests.map((t) => ({ testName: t.testName, note: t.note || undefined })),
  };
}

/** Name field with catalog suggestions under it; picking one fills strength, form and unit. */
function MedicineName({ control, index, onPick }: { control: Control<Values>; index: number; onPick: (m: { id: string; brandName: string; strength: string; form: MedicineForm; suggestedDoseUnit: DoseUnit }) => void }) {
  const [focused, setFocused] = useState(false);
  const name = useWatch({ control, name: `items.${index}.medicineName` }) ?? '';
  const search = useMedicineCatalogSearch(focused ? name : '');
  return (
    <Controller
      control={control}
      name={`items.${index}.medicineName`}
      render={({ field, fieldState }) => (
        <View className="gap-1">
          <LabeledTextInput
            label="ওষুধের নাম"
            placeholder="যেমন: Napa"
            icon={Pill}
            value={field.value}
            onChangeText={field.onChange}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 200)}
            errorText={fieldState.error?.message}
          />
          {focused && (search.data?.length ?? 0) > 0 ? (
            <View className="overflow-hidden rounded-2xl border border-line bg-surface-card">
              {search.data!.slice(0, 5).map((m) => (
                <Pressable
                  key={m.id}
                  accessibilityRole="button"
                  onPress={() => {
                    onPick(m);
                    setFocused(false);
                  }}
                  className="border-b border-line/60 px-4 py-2.5 active:bg-primary-50">
                  <BanglaText variant="body-strong">
                    {m.brandName} {m.strength}
                  </BanglaText>
                  <BanglaText variant="caption" numberOfLines={1}>
                    {m.genericName} · {FORM_LABEL[m.form]}
                  </BanglaText>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      )}
    />
  );
}

function AlarmPreview({ control, index }: { control: Control<Values>; index: number }) {
  const pattern = useWatch({ control, name: `items.${index}.dosePattern` }) ?? '';
  const unit = useWatch({ control, name: `items.${index}.doseUnit` }) ?? 'TABLET';
  const times = doseTimesFromPattern(toAsciiDigits(pattern));
  if (!times) return null;
  return (
    <BanglaText variant="caption">
      অ্যালার্ম: {times.map((t) => `${banglaClock(t.time)} ${doseText(t.dose, unit)}`).join(' · ')}
    </BanglaText>
  );
}

/** Writing a prescription on the phone: medicines, tests, advice; save or issue. */
export function PrescriptionEditor({ prescription }: { prescription: PrescriptionResponse }) {
  const rx = usePrescriptionWriting();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(prescription) });
  const items = useFieldArray({ control: form.control, name: 'items' });
  const tests = useFieldArray({ control: form.control, name: 'tests' });
  const fail = (e: unknown) => showToast(apiErrorMessage(e));
  const busy = rx.save.isPending || rx.issue.isPending;

  const save = form.handleSubmit((v) =>
    rx.save.mutate(
      { id: prescription.id, body: toRequest(v) },
      { onSuccess: (saved) => { form.reset(toValues(saved)); showToast('খসড়া সেভ হয়েছে'); }, onError: fail }
    )
  );
  const issue = form.handleSubmit(async (v) => {
    const ok = await confirmAction({
      title: 'প্রেসক্রিপশন দেবেন?',
      message: 'দেওয়ার পর আর বদলানো যাবে না। রোগী আর পরিবার অ্যাপে পাবেন।',
      confirmLabel: 'দিন',
    });
    if (!ok) return;
    try {
      await rx.save.mutateAsync({ id: prescription.id, body: toRequest(v) });
      await rx.issue.mutateAsync(prescription.id);
      showToast('প্রেসক্রিপশন দেওয়া হয়েছে');
    } catch (e) {
      fail(e);
    }
  });

  const text = (name: 'chiefComplaint' | 'diagnosis' | 'advice' | 'followUpAfterDays', label: string, multiline = true) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <LabeledTextInput
          label={label}
          value={field.value}
          onChangeText={field.onChange}
          multiline={multiline}
          keyboardType={multiline ? 'default' : 'number-pad'}
          textAlignVertical={multiline ? 'top' : 'center'}
          style={multiline ? { minHeight: 72 } : undefined}
          errorText={fieldState.error?.message}
        />
      )}
    />
  );

  return (
    <View className="gap-4">
      <SurfaceCard className="gap-4">
        {text('chiefComplaint', 'রোগীর সমস্যা')}
        {text('diagnosis', 'রোগ নির্ণয়')}
      </SurfaceCard>

      <BanglaText variant="heading">ওষুধ</BanglaText>
      {items.fields.map((field, index) => (
        <SurfaceCard key={field.id} className="gap-3">
          <View className="flex-row items-center justify-between">
            <BanglaText variant="body-strong">{toBanglaDigits(index + 1)} নম্বর ওষুধ</BanglaText>
            <Pressable accessibilityRole="button" accessibilityLabel="ওষুধ বাদ দিন" onPress={() => items.remove(index)} className="h-11 w-11 items-center justify-center rounded-full active:bg-danger-soft">
              <Trash2 size={20} color={colors.danger} />
            </Pressable>
          </View>
          <MedicineName
            control={form.control}
            index={index}
            onPick={(m) => {
              form.setValue(`items.${index}.medicineName`, m.brandName, { shouldValidate: true });
              form.setValue(`items.${index}.medicineId`, m.id);
              form.setValue(`items.${index}.strength`, m.strength);
              form.setValue(`items.${index}.form`, m.form);
              form.setValue(`items.${index}.doseUnit`, m.suggestedDoseUnit);
            }}
          />
          <Controller control={form.control} name={`items.${index}.strength`} render={({ field }) => <LabeledTextInput label="শক্তি" placeholder="500 mg" value={field.value} onChangeText={field.onChange} />} />
          <Controller
            control={form.control}
            name={`items.${index}.form`}
            render={({ field }) => (
              <ChipSelect label="ধরন" scroll options={FORMS} value={field.value} onChange={(v) => { field.onChange(v); form.setValue(`items.${index}.doseUnit`, DEFAULT_UNIT[v]); }} />
            )}
          />
          <Controller control={form.control} name={`items.${index}.doseUnit`} render={({ field }) => <ChipSelect label="প্রতিবার কী হিসেবে" scroll options={UNITS} value={field.value} onChange={field.onChange} />} />
          <Controller
            control={form.control}
            name={`items.${index}.dosePattern`}
            render={({ field, fieldState }) => (
              <View className="gap-2">
                <LabeledTextInput label="ডোজ (সকাল+দুপুর+রাত)" value={field.value} onChangeText={field.onChange} errorText={fieldState.error?.message} />
                <ChipSelect scroll options={PATTERNS} value={field.value} onChange={field.onChange} />
              </View>
            )}
          />
          <AlarmPreview control={form.control} index={index} />
          <Controller control={form.control} name={`items.${index}.mealTiming`} render={({ field }) => <ChipSelect label="কখন" scroll options={MEALS} value={field.value} onChange={field.onChange} />} />
          <Controller control={form.control} name={`items.${index}.durationDays`} render={({ field, fieldState }) => <LabeledTextInput label="কত দিন" helperText="খালি = চলবে" keyboardType="number-pad" value={field.value} onChangeText={field.onChange} errorText={fieldState.error?.message} />} />
          <Controller control={form.control} name={`items.${index}.instruction`} render={({ field }) => <LabeledTextInput label="নির্দেশনা (ঐচ্ছিক)" placeholder="যেমন: ব্যথা হলে" value={field.value} onChangeText={field.onChange} />} />
        </SurfaceCard>
      ))}
      <ActionButton label="ওষুধ যোগ করুন" variant="secondary" icon={Plus} disabled={items.fields.length >= 20} onPress={() => items.append(NEW_ITEM)} />

      <BanglaText variant="heading">পরীক্ষা</BanglaText>
      {tests.fields.map((field, index) => (
        <SurfaceCard key={field.id} className="gap-3">
          <View className="flex-row items-start gap-2">
            <View className="flex-1 gap-3">
              <Controller control={form.control} name={`tests.${index}.testName`} render={({ field: f, fieldState }) => <LabeledTextInput label="টেস্টের নাম" icon={FlaskConical} placeholder="CBC" value={f.value} onChangeText={f.onChange} errorText={fieldState.error?.message} />} />
              <Controller control={form.control} name={`tests.${index}.note`} render={({ field: f }) => <LabeledTextInput label="নোট (ঐচ্ছিক)" placeholder="যেমন: খালি পেটে" value={f.value} onChangeText={f.onChange} />} />
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="টেস্ট বাদ দিন" onPress={() => tests.remove(index)} className="mt-7 h-11 w-11 items-center justify-center rounded-full active:bg-danger-soft">
              <Trash2 size={20} color={colors.danger} />
            </Pressable>
          </View>
        </SurfaceCard>
      ))}
      <ActionButton label="টেস্ট যোগ করুন" variant="secondary" icon={FlaskConical} disabled={tests.fields.length >= 20} onPress={() => tests.append({ testName: '', note: '' })} />

      <SurfaceCard className="gap-4">
        {text('advice', 'উপদেশ')}
        {text('followUpAfterDays', 'কত দিন পর আবার আসবেন (ঐচ্ছিক)', false)}
      </SurfaceCard>

      <View className="flex-row gap-2">
        <View className="flex-1">
          <ActionButton label="সেভ" variant="outline" icon={Save} loading={rx.save.isPending && !rx.issue.isPending} disabled={busy} onPress={() => void save()} />
        </View>
        <View className="flex-1">
          <ActionButton label="দিন" icon={Send} loading={rx.issue.isPending} disabled={busy} onPress={() => void issue()} />
        </View>
      </View>
      <ActionButton
        label="খসড়া মুছুন"
        variant="ghost"
        icon={Trash2}
        loading={rx.remove.isPending}
        onPress={() =>
          void confirmAction({ title: 'খসড়া মুছবেন?', message: prescription.code, confirmLabel: 'মুছুন', destructive: true }).then(
            (ok) => ok && rx.remove.mutate(prescription.id, { onSuccess: () => { showToast('মুছে ফেলা হয়েছে'); router.back(); }, onError: fail })
          )
        }
      />
    </View>
  );
}
