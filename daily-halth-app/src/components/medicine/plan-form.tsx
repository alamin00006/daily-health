import { Check, Minus, Plus, Search, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';

import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ChipSelect } from '@/components/ui/chip-select';
import { DateField, TimeField, pickTime } from '@/components/ui/date-time-field';
import { FormErrorBanner } from '@/components/ui/form-error-banner';
import { LabeledTextInput } from '@/components/ui/labeled-text-input';
import { SurfaceCard } from '@/components/ui/surface-card';
import { apiErrorMessage } from '@/api/api-error-messages';
import { DOSE_UNIT_LABELS, MEAL_TIMING_LABELS } from '@/features/medicine/medicine-display';
import { useMedicineSearch } from '@/features/medicine/use-medicine';
import { toAsciiDigits, toBanglaDigits } from '@/lib/bangla-digits';
import {
  addDays,
  banglaClock,
  BANGLA_WEEKDAYS_SHORT,
  dhakaDate,
  formatDate,
  formatDose,
} from '@/lib/bangla-format';
import type {
  CreateMedicationPlanRequest,
  DoseUnit,
  MealTiming,
  MedicationPlanResponse,
} from '@/shared-contracts/medicine.contract';
import { colors } from '@/theme/design-tokens';

interface TimeRow {
  key: number;
  time: string;
  dose: number;
  /** null = every day */
  days: number[] | null;
}

type Duration = 'ONGOING' | '5' | '7' | '14' | '30' | 'DATE';

const PRESETS: { label: string; times: string[] }[] = [
  { label: 'দিনে ১ বার', times: ['08:00'] },
  { label: 'দিনে ২ বার', times: ['08:00', '20:00'] },
  { label: 'দিনে ৩ বার', times: ['08:00', '14:00', '21:00'] },
];

const UNIT_OPTIONS = (
  [
    'TABLET',
    'CAPSULE',
    'SPOON',
    'ML',
    'DROP',
    'PUFF',
    'UNIT',
    'SACHET',
    'APPLICATION',
  ] as DoseUnit[]
).map((value) => ({ value, label: DOSE_UNIT_LABELS[value] }));
const MEAL_OPTIONS = (['AFTER_MEAL', 'BEFORE_MEAL', 'WITH_MEAL', 'ANY'] as MealTiming[]).map(
  (value) => ({
    value,
    label: MEAL_TIMING_LABELS[value],
  })
);
const OFFSET_OPTIONS = [0, 15, 30, 60].map((value) => ({
  value,
  label: value === 0 ? 'ঠিক আগে/পরে' : `${toBanglaDigits(value)} মিনিট`,
}));
const DURATION_OPTIONS: { value: Duration; label: string }[] = [
  { value: 'ONGOING', label: 'চলতে থাকবে' },
  { value: '5', label: '৫ দিন' },
  { value: '7', label: '৭ দিন' },
  { value: '14', label: '১৪ দিন' },
  { value: '30', label: '১ মাস' },
  { value: 'DATE', label: 'নির্দিষ্ট তারিখ পর্যন্ত' },
];

let rowKey = 0;
const row = (time: string, dose = 1, days: number[] | null = null): TimeRow => ({
  key: ++rowKey,
  time,
  dose,
  days,
});

function DoseStepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const step = (delta: number) =>
    onChange(Math.min(20, Math.max(0.25, Math.round((value + delta) * 4) / 4)));
  return (
    <View className="flex-row items-center gap-1 rounded-2xl border border-line bg-surface p-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="কম"
        onPress={() => step(value <= 1 ? -0.25 : -0.5)}
        className="h-10 w-10 items-center justify-center rounded-xl active:bg-primary-100">
        <Minus size={18} color={colors.primary} />
      </Pressable>
      <BanglaText className="min-w-[34px] text-center font-bangla-bold text-[18px] leading-[24px]">
        {formatDose(value)}
      </BanglaText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="বেশি"
        onPress={() => step(value < 1 ? 0.25 : 0.5)}
        className="h-10 w-10 items-center justify-center rounded-xl active:bg-primary-100">
        <Plus size={18} color={colors.primary} />
      </Pressable>
    </View>
  );
}

export type PlanFormValues = CreateMedicationPlanRequest;

interface PlanFormProps {
  plan?: MedicationPlanResponse;
  submitLabel: string;
  submitting: boolean;
  error: unknown;
  onSubmit: (values: PlanFormValues) => void;
}

/** Add or edit a medicine: name (catalog search), times with per-time doses, meal timing, duration, stock. */
export function PlanForm({ plan, submitLabel, submitting, error, onSubmit }: PlanFormProps) {
  const editing = Boolean(plan);
  const [name, setName] = useState(plan?.displayName ?? '');
  const [medicineId, setMedicineId] = useState<string | undefined>(plan?.medicineId ?? undefined);
  const [showResults, setShowResults] = useState(!editing);
  const [unit, setUnit] = useState<DoseUnit>(plan?.doseUnit ?? 'TABLET');
  const [rows, setRows] = useState<TimeRow[]>(
    plan
      ? plan.times.map((t) => row(t.time, t.dose, t.days.length === 7 ? null : t.days))
      : [row('08:00'), row('20:00')]
  );
  const [meal, setMeal] = useState<MealTiming>(plan?.mealTiming ?? 'AFTER_MEAL');
  const [offset, setOffset] = useState<number>(plan?.mealOffsetMin ?? 0);
  const [duration, setDuration] = useState<Duration>(plan?.endDate ? 'DATE' : 'ONGOING');
  const [endDate, setEndDate] = useState<string | null>(plan?.endDate ?? null);
  const [stock, setStock] = useState(plan?.stockQty != null ? toBanglaDigits(plan.stockQty) : '');
  const [refillDays, setRefillDays] = useState(plan?.refillAlertDays ?? 5);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const search = useMedicineSearch(medicineId ? '' : name);
  const results = showResults && !medicineId ? (search.data ?? []) : [];

  const updateRow = (key: number, patch: Partial<TimeRow>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const submit = () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'ওষুধের নাম লিখুন।';
    if (rows.length === 0) next.times = 'অন্তত একটি সময় দিন।';
    if (new Set(rows.map((r) => r.time)).size !== rows.length)
      next.times = 'একই সময় দুবার দেওয়া যাবে না।';
    if (rows.some((r) => r.days !== null && r.days.length === 0))
      next.times = 'প্রতিটি সময়ের জন্য অন্তত একটি দিন বেছে নিন।';
    const stockText = toAsciiDigits(stock).trim();
    const stockQty = stockText === '' ? null : Number(stockText);
    if (stockQty !== null && (!Number.isFinite(stockQty) || stockQty < 0 || stockQty > 10000))
      next.stock = 'সঠিক সংখ্যা লিখুন।';
    const end =
      duration === 'ONGOING'
        ? null
        : duration === 'DATE'
          ? endDate
          : addDays(plan?.startDate ?? dhakaDate(), Number(duration) - 1);
    if (duration === 'DATE' && !endDate) next.endDate = 'শেষ তারিখ বেছে নিন।';
    setErrors(next);
    if (Object.keys(next).length) return;

    onSubmit({
      ...(medicineId ? { medicineId } : {}),
      displayName: name.trim(),
      doseUnit: unit,
      mealTiming: meal,
      mealOffsetMin: meal === 'ANY' || meal === 'WITH_MEAL' || offset === 0 ? null : offset,
      endDate: end,
      times: [...rows]
        .sort((a, b) => a.time.localeCompare(b.time))
        .map((r) => ({ time: r.time, dose: r.dose, ...(r.days ? { days: r.days } : {}) })),
      stockQty: stockQty === null ? null : Math.round(stockQty * 4) / 4,
      refillAlertDays: refillDays,
    });
  };

  return (
    <View className="gap-6">
      {/* 1. Name */}
      <View className="gap-2">
        <LabeledTextInput
          label="ওষুধের নাম"
          icon={Search}
          value={name}
          onChangeText={(text) => {
            setName(text);
            setMedicineId(undefined);
            setShowResults(true);
            setErrors((e) => ({ ...e, name: '' }));
          }}
          placeholder="যেমন: Napa, Seclo, Amdocal"
          autoCapitalize="words"
          autoFocus={!editing}
          errorText={errors.name || null}
        />
        {medicineId ? (
          <View className="flex-row items-center gap-2">
            <Check size={16} color={colors.success} />
            <BanglaText variant="caption" className="text-success">
              তালিকা থেকে বেছে নেওয়া হয়েছে
            </BanglaText>
          </View>
        ) : null}
        {search.isFetching && !medicineId && name.trim().length >= 2 ? (
          <ActivityIndicator color={colors.primary} />
        ) : null}
        {results.length > 0 ? (
          <SurfaceCard flush className="overflow-hidden">
            {results.slice(0, 6).map((medicine, index) => (
              <Pressable
                key={medicine.id}
                accessibilityRole="button"
                onPress={() => {
                  setName(medicine.displayName);
                  setMedicineId(medicine.id);
                  setUnit(medicine.suggestedDoseUnit);
                  setShowResults(false);
                }}
                className={`gap-0.5 px-4 py-3 active:bg-primary-50 ${index > 0 ? 'border-t border-line/60' : ''}`}>
                <BanglaText variant="body-strong">{medicine.displayName}</BanglaText>
                <BanglaText variant="caption">
                  {medicine.genericName}
                  {medicine.manufacturer ? ` · ${medicine.manufacturer}` : ''}
                </BanglaText>
              </Pressable>
            ))}
            <Pressable
              onPress={() => setShowResults(false)}
              className="border-t border-line/60 px-4 py-3 active:bg-primary-50">
              <BanglaText variant="label" className="text-primary">
                তালিকায় নেই? “{name.trim()}” নামেই রাখুন
              </BanglaText>
            </Pressable>
          </SurfaceCard>
        ) : null}
      </View>

      <ChipSelect
        label="প্রতিবার কী হিসেবে খাবেন?"
        options={UNIT_OPTIONS}
        value={unit}
        onChange={setUnit}
      />

      {/* 2. Times */}
      <View className="gap-3">
        <BanglaText variant="label">কখন খাবেন?</BanglaText>
        <View className="flex-row flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <Pressable
              key={preset.label}
              accessibilityRole="button"
              onPress={() => setRows(preset.times.map((t) => row(t)))}
              className="min-h-touch justify-center rounded-full bg-primary-50 px-4 active:bg-primary-100">
              <BanglaText variant="label" className="font-bangla-semibold text-primary-700">
                {preset.label}
              </BanglaText>
            </Pressable>
          ))}
        </View>

        {rows.map((r) => (
          <SurfaceCard key={r.key} className="gap-3 p-4">
            <View className="flex-row items-center gap-3">
              <View className="flex-1">
                {Platform.OS === 'android' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`সময় ${banglaClock(r.time)}, বদলাতে চাপুন`}
                    onPress={() => pickTime(r.time, (time) => updateRow(r.key, { time }))}
                    className="min-h-touch justify-center">
                    <BanglaText className="font-bangla-bold text-[20px] leading-[28px] text-primary">
                      {banglaClock(r.time)}
                    </BanglaText>
                    <BanglaText variant="caption">সময় বদলাতে চাপুন</BanglaText>
                  </Pressable>
                ) : (
                  <TimeField
                    label="সময়"
                    value={r.time}
                    onChange={(time) => updateRow(r.key, { time })}
                  />
                )}
              </View>
              <DoseStepper value={r.dose} onChange={(dose) => updateRow(r.key, { dose })} />
              {rows.length > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="এই সময় বাদ দিন"
                  hitSlop={8}
                  onPress={() => setRows((list) => list.filter((x) => x.key !== r.key))}
                  className="h-10 w-10 items-center justify-center rounded-full active:bg-danger-soft">
                  <Trash2 size={18} color={colors.danger} />
                </Pressable>
              ) : null}
            </View>
            <View className="flex-row flex-wrap items-center gap-1.5">
              <Pressable
                onPress={() => updateRow(r.key, { days: r.days ? null : [0, 1, 2, 3, 4, 5, 6] })}
                className={`min-h-[36px] justify-center rounded-full px-3 ${r.days ? 'bg-surface' : 'bg-primary-100'}`}>
                <BanglaText
                  variant="caption"
                  className={r.days ? 'text-ink-muted' : 'font-bangla-semibold text-primary-700'}>
                  প্রতিদিন
                </BanglaText>
              </Pressable>
              {r.days ? (
                BANGLA_WEEKDAYS_SHORT.map((label, day) => {
                  const on = r.days!.includes(day);
                  return (
                    <Pressable
                      key={day}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      onPress={() =>
                        updateRow(r.key, {
                          days: on ? r.days!.filter((d) => d !== day) : [...r.days!, day].sort(),
                        })
                      }
                      className={`min-h-[36px] min-w-[40px] items-center justify-center rounded-full px-2 ${on ? 'bg-primary' : 'bg-surface'}`}>
                      <BanglaText
                        variant="caption"
                        className={on ? 'font-bangla-semibold text-white' : 'text-ink-muted'}>
                        {label}
                      </BanglaText>
                    </Pressable>
                  );
                })
              ) : (
                <BanglaText variant="caption" className="text-ink-subtle">
                  (নির্দিষ্ট দিনে খেতে হলে “প্রতিদিন” চাপুন)
                </BanglaText>
              )}
            </View>
          </SurfaceCard>
        ))}
        {errors.times ? (
          <BanglaText variant="caption" className="text-danger">
            {errors.times}
          </BanglaText>
        ) : null}
        {rows.length < 8 ? (
          <ActionButton
            label="আরেকটি সময় যোগ করুন"
            icon={Plus}
            variant="ghost"
            size="sm"
            onPress={() => setRows((list) => [...list, row(list.length ? '14:00' : '08:00')])}
          />
        ) : null}
      </View>

      {/* 3. Meal timing */}
      <View className="gap-3">
        <ChipSelect
          label="খাবারের সাথে সম্পর্ক"
          options={MEAL_OPTIONS}
          value={meal}
          onChange={setMeal}
        />
        {meal === 'BEFORE_MEAL' || meal === 'AFTER_MEAL' ? (
          <ChipSelect
            label={meal === 'BEFORE_MEAL' ? 'খাবারের কত আগে?' : 'খাবারের কত পরে?'}
            options={OFFSET_OPTIONS}
            value={offset}
            onChange={setOffset}
          />
        ) : null}
      </View>

      {/* 4. Duration */}
      <View className="gap-3">
        <ChipSelect
          label="কত দিন খাবেন?"
          options={DURATION_OPTIONS}
          value={duration}
          onChange={setDuration}
        />
        {duration === 'DATE' ? (
          <DateField
            label="শেষ দিন"
            value={endDate}
            onChange={setEndDate}
            minimumDate={new Date()}
            errorText={errors.endDate}
          />
        ) : duration !== 'ONGOING' ? (
          <BanglaText variant="caption">
            শেষ হবে {formatDate(addDays(plan?.startDate ?? dhakaDate(), Number(duration) - 1))}
          </BanglaText>
        ) : null}
      </View>

      {/* 5. Stock */}
      <SurfaceCard className="gap-4">
        <View className="gap-1">
          <BanglaText variant="body-strong">ঘরে কতগুলো আছে? (ঐচ্ছিক)</BanglaText>
          <BanglaText variant="caption">দিলে ফুরিয়ে আসার আগে মনে করিয়ে দেব।</BanglaText>
        </View>
        <LabeledTextInput
          label={`সংখ্যা (${DOSE_UNIT_LABELS[unit]})`}
          value={stock}
          onChangeText={setStock}
          placeholder="যেমন: ৩০"
          keyboardType="decimal-pad"
          maxLength={6}
          errorText={errors.stock || null}
        />
        {stock.trim() ? (
          <ChipSelect
            label="কত দিন বাকি থাকতে জানাব?"
            options={[3, 5, 7].map((value) => ({ value, label: `${toBanglaDigits(value)} দিন` }))}
            value={refillDays}
            onChange={setRefillDays}
          />
        ) : null}
      </SurfaceCard>

      <FormErrorBanner message={error ? apiErrorMessage(error) : null} />
      <ActionButton label={submitLabel} icon={Check} loading={submitting} onPress={submit} />
      {editing ? null : (
        <BanglaText variant="caption" className="text-center text-ink-subtle">
          প্রতিটি সময়ে ফোনে অ্যালার্ম বাজবে, ইন্টারনেট না থাকলেও।
        </BanglaText>
      )}
    </View>
  );
}
