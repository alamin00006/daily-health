import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { Ban, Plus, Save, Send, Trash2 } from 'lucide-react-native';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { Pressable, View } from 'react-native';
import { z } from 'zod';

import { apiErrorMessage } from '@/api/api-error-messages';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ChipSelect } from '@/components/ui/chip-select';
import { DateField, TimeField } from '@/components/ui/date-time-field';
import { LabeledTextInput } from '@/components/ui/labeled-text-input';
import { SurfaceCard } from '@/components/ui/surface-card';
import { MEAL_LABEL, useProviderDietActions } from '@/features/nutrition/use-diet';
import { toAsciiDigits, toBanglaDigits } from '@/lib/bangla-digits';
import { dhakaDate } from '@/lib/bangla-format';
import { confirmAction, showToast } from '@/lib/user-feedback';
import type { MealType, ProviderDietPlanResponse, UpdateDietPlanRequest } from '@/shared-contracts/nutrition.contract';
import { colors } from '@/theme/design-tokens';

const MEAL_TYPES = (Object.keys(MEAL_LABEL) as MealType[]).map((value) => ({ value, label: MEAL_LABEL[value] }));
const MAX_MEALS = 6;

const intText = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .refine((v) => /^\d+$/.test(toAsciiDigits(v)) && Number(toAsciiDigits(v)) >= min && Number(toAsciiDigits(v)) <= max, message);

const schema = z
  .object({
    title: z.string().trim().min(2, 'অন্তত ২ অক্ষর').max(120),
    calorieTargetKcal: intText(500, 6000, '৫০০ থেকে ৬০০০ kcal'),
    waterTargetMl: intText(500, 8000, '৫০০ থেকে ৮০০০ মিলি'),
    startDate: z.string().min(10, 'শুরুর তারিখ দিন'),
    endDate: z.string().nullable(),
    notes: z.string().trim().max(3000),
    meals: z
      .array(
        z.object({
          mealType: z.enum(['BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER']),
          time: z.string().regex(/^\d{2}:\d{2}$/, 'সময় দিন'),
          description: z.string().trim().min(2, 'কী খাবেন লিখুন').max(1000),
          approxKcal: z
            .string()
            .trim()
            .refine((v) => v === '' || (/^\d+$/.test(toAsciiDigits(v)) && Number(toAsciiDigits(v)) <= 5000), '০ থেকে ৫০০০'),
        })
      )
      .min(1, 'অন্তত একটি খাবার দিন')
      .max(MAX_MEALS),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { path: ['endDate'], message: 'শেষের তারিখ শুরুর আগে' });
type Values = z.infer<typeof schema>;

const DEFAULT_MEALS: Values['meals'] = [
  { mealType: 'BREAKFAST', time: '08:00', description: '', approxKcal: '' },
  { mealType: 'LUNCH', time: '13:30', description: '', approxKcal: '' },
  { mealType: 'SNACKS', time: '17:00', description: '', approxKcal: '' },
  { mealType: 'DINNER', time: '21:00', description: '', approxKcal: '' },
];
const NEXT_TIME: Record<MealType, string> = { BREAKFAST: '08:00', LUNCH: '13:30', SNACKS: '17:00', DINNER: '21:00' };

function toValues(p: ProviderDietPlanResponse | undefined): Values {
  if (!p) {
    return {
      title: 'ডায়েট চার্ট',
      calorieTargetKcal: '1800',
      waterTargetMl: '2500',
      startDate: dhakaDate(),
      endDate: null,
      notes: '',
      meals: DEFAULT_MEALS,
    };
  }
  return {
    title: p.title,
    calorieTargetKcal: String(p.calorieTargetKcal),
    waterTargetMl: String(p.waterTargetMl),
    startDate: p.startDate,
    endDate: p.endDate,
    notes: p.notes ?? '',
    meals: p.meals.map((m) => ({
      mealType: m.mealType,
      time: m.time,
      description: m.description,
      approxKcal: m.approxKcal === null ? '' : String(m.approxKcal),
    })),
  };
}

function toRequest(v: Values): UpdateDietPlanRequest {
  return {
    title: v.title,
    calorieTargetKcal: Number(toAsciiDigits(v.calorieTargetKcal)),
    waterTargetMl: Number(toAsciiDigits(v.waterTargetMl)),
    startDate: v.startDate,
    endDate: v.endDate,
    notes: v.notes || null,
    meals: v.meals.map((m) => ({
      mealType: m.mealType,
      time: m.time,
      description: m.description,
      approxKcal: m.approxKcal ? Number(toAsciiDigits(m.approxKcal)) : null,
    })),
  };
}

/**
 * Writing a diet chart on the phone. A new chart needs the visit (`appointmentId`);
 * an existing one is a DRAFT (save / publish / delete) or ACTIVE (correct / end).
 */
export function DietPlanEditor({ plan, appointmentId }: { plan?: ProviderDietPlanResponse; appointmentId?: string }) {
  const actions = useProviderDietActions();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(plan) });
  const meals = useFieldArray({ control: form.control, name: 'meals' });
  const fail = (e: unknown) => showToast(apiErrorMessage(e));
  const busy = actions.create.isPending || actions.update.isPending || actions.step.isPending || actions.remove.isPending;
  const active = plan?.status === 'ACTIVE';

  /** Saves the form; returns the saved plan's id. */
  const persist = async (v: Values): Promise<string> => {
    const body = toRequest(v);
    if (plan) {
      const saved = await actions.update.mutateAsync({ id: plan.id, body });
      form.reset(toValues(saved));
      return saved.id;
    }
    const created = await actions.create.mutateAsync({ ...body, appointmentId: appointmentId! });
    router.replace({ pathname: '/provider/diet-plans/[planId]', params: { planId: created.id } });
    return created.id;
  };

  const save = form.handleSubmit(async (v) => {
    try {
      await persist(v);
      showToast(active ? 'চার্ট আপডেট হয়েছে' : 'খসড়া সেভ হয়েছে');
    } catch (e) {
      fail(e);
    }
  });

  const publish = form.handleSubmit(async (v) => {
    const ok = await confirmAction({
      title: 'চার্ট দেবেন?',
      message: 'রোগী অ্যাপে পাবেন। আগের চালু চার্ট থাকলে সেটি শেষ হয়ে যাবে।',
      confirmLabel: 'দিন',
    });
    if (!ok) return;
    try {
      const id = await persist(v);
      await actions.step.mutateAsync({ id, step: 'publish' });
      showToast('ডায়েট চার্ট দেওয়া হয়েছে');
    } catch (e) {
      fail(e);
    }
  });

  const end = async () => {
    if (!plan) return;
    const ok = await confirmAction({ title: 'চার্ট শেষ করবেন?', message: 'আজ থেকে রোগী এটি আর দৈনিক তালিকায় দেখবেন না।', confirmLabel: 'শেষ করুন', destructive: true });
    if (ok) actions.step.mutate({ id: plan.id, step: 'end' }, { onSuccess: () => showToast('চার্ট শেষ করা হয়েছে'), onError: fail });
  };

  const remove = async () => {
    if (!plan) return;
    const ok = await confirmAction({ title: 'খসড়া মুছবেন?', message: plan.title, confirmLabel: 'মুছুন', destructive: true });
    if (ok)
      actions.remove.mutate(plan.id, {
        onSuccess: () => {
          showToast('মুছে ফেলা হয়েছে');
          router.back();
        },
        onError: fail,
      });
  };

  return (
    <View className="gap-4">
      <SurfaceCard className="gap-4">
        <Controller
          control={form.control}
          name="title"
          render={({ field, fieldState }) => (
            <LabeledTextInput label="চার্টের নাম" value={field.value} onChangeText={field.onChange} maxLength={120} errorText={fieldState.error?.message} />
          )}
        />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Controller
              control={form.control}
              name="calorieTargetKcal"
              render={({ field, fieldState }) => (
                <LabeledTextInput label="দৈনিক ক্যালরি (kcal)" keyboardType="number-pad" value={field.value} onChangeText={field.onChange} errorText={fieldState.error?.message} />
              )}
            />
          </View>
          <View className="flex-1">
            <Controller
              control={form.control}
              name="waterTargetMl"
              render={({ field, fieldState }) => (
                <LabeledTextInput label="পানি (মিলি)" keyboardType="number-pad" value={field.value} onChangeText={field.onChange} errorText={fieldState.error?.message} />
              )}
            />
          </View>
        </View>
        <Controller
          control={form.control}
          name="startDate"
          render={({ field, fieldState }) => (
            <DateField label="শুরু" value={field.value} onChange={(v) => field.onChange(v ?? '')} errorText={fieldState.error?.message} />
          )}
        />
        <Controller
          control={form.control}
          name="endDate"
          render={({ field, fieldState }) => (
            <DateField label="শেষ (ঐচ্ছিক)" placeholder="খালি = চলবে" clearable value={field.value} onChange={field.onChange} errorText={fieldState.error?.message} />
          )}
        />
      </SurfaceCard>

      <BanglaText variant="heading">খাবার</BanglaText>
      {form.formState.errors.meals?.root?.message || form.formState.errors.meals?.message ? (
        <BanglaText variant="caption" className="text-danger">
          {form.formState.errors.meals?.root?.message ?? form.formState.errors.meals?.message}
        </BanglaText>
      ) : null}
      {meals.fields.map((field, index) => (
        <SurfaceCard key={field.id} className="gap-3">
          <View className="flex-row items-center justify-between">
            <BanglaText variant="body-strong">{toBanglaDigits(index + 1)} নম্বর বেলা</BanglaText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="খাবার বাদ দিন"
              disabled={meals.fields.length <= 1}
              onPress={() => meals.remove(index)}
              className={`h-11 w-11 items-center justify-center rounded-full active:bg-danger-soft ${meals.fields.length <= 1 ? 'opacity-30' : ''}`}>
              <Trash2 size={20} color={colors.danger} />
            </Pressable>
          </View>
          <Controller
            control={form.control}
            name={`meals.${index}.mealType`}
            render={({ field: f }) => <ChipSelect label="বেলা" scroll options={MEAL_TYPES} value={f.value} onChange={f.onChange} />}
          />
          <Controller
            control={form.control}
            name={`meals.${index}.time`}
            render={({ field: f, fieldState }) => <TimeField label="সময়" value={f.value} onChange={f.onChange} errorText={fieldState.error?.message} />}
          />
          <Controller
            control={form.control}
            name={`meals.${index}.description`}
            render={({ field: f, fieldState }) => (
              <LabeledTextInput
                label="কী খাবেন"
                placeholder="যেমন: ২টি আটার রুটি, ১ বাটি সবজি, ১টি ডিম"
                multiline
                textAlignVertical="top"
                style={{ minHeight: 72 }}
                maxLength={1000}
                value={f.value}
                onChangeText={f.onChange}
                errorText={fieldState.error?.message}
              />
            )}
          />
          <Controller
            control={form.control}
            name={`meals.${index}.approxKcal`}
            render={({ field: f, fieldState }) => (
              <LabeledTextInput label="আনুমানিক kcal (ঐচ্ছিক)" keyboardType="number-pad" value={f.value} onChangeText={f.onChange} errorText={fieldState.error?.message} />
            )}
          />
        </SurfaceCard>
      ))}
      <ActionButton
        label="বেলা যোগ করুন"
        variant="secondary"
        icon={Plus}
        disabled={meals.fields.length >= MAX_MEALS}
        onPress={() => meals.append({ mealType: 'SNACKS', time: NEXT_TIME.SNACKS, description: '', approxKcal: '' })}
      />

      <SurfaceCard>
        <Controller
          control={form.control}
          name="notes"
          render={({ field, fieldState }) => (
            <LabeledTextInput
              label="পরামর্শ (ঐচ্ছিক)"
              placeholder="যেমন: চিনি আর ভাজাপোড়া বাদ, রোজ ৩০ মিনিট হাঁটা"
              multiline
              textAlignVertical="top"
              style={{ minHeight: 96 }}
              maxLength={3000}
              value={field.value}
              onChangeText={field.onChange}
              errorText={fieldState.error?.message}
            />
          )}
        />
      </SurfaceCard>

      {active ? (
        <>
          <ActionButton label="সংশোধন সেভ করুন" icon={Save} loading={actions.update.isPending} disabled={busy} onPress={() => void save()} />
          <ActionButton label="চার্ট শেষ করুন" variant="ghost" icon={Ban} loading={actions.step.isPending} disabled={busy} onPress={() => void end()} />
        </>
      ) : (
        <>
          <View className="flex-row gap-2">
            <View className="flex-1">
              <ActionButton
                label="সেভ"
                variant="outline"
                icon={Save}
                loading={(actions.update.isPending || actions.create.isPending) && !actions.step.isPending}
                disabled={busy}
                onPress={() => void save()}
              />
            </View>
            <View className="flex-1">
              <ActionButton label="দিন" icon={Send} loading={actions.step.isPending} disabled={busy} onPress={() => void publish()} />
            </View>
          </View>
          {plan ? (
            <ActionButton label="খসড়া মুছুন" variant="ghost" icon={Trash2} loading={actions.remove.isPending} disabled={busy} onPress={() => void remove()} />
          ) : null}
        </>
      )}
    </View>
  );
}
