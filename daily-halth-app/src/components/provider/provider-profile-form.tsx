import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Save } from 'lucide-react-native';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Pressable, View } from 'react-native';
import { z } from 'zod';

import { apiErrorMessage } from '@/api/api-error-messages';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ChipSelect } from '@/components/ui/chip-select';
import { FormErrorBanner } from '@/components/ui/form-error-banner';
import { LabeledTextInput } from '@/components/ui/labeled-text-input';
import { SkeletonBlock } from '@/components/ui/state-views';
import { SwitchRow } from '@/components/ui/switch-row';
import { PROVIDER_TYPE_LABEL } from '@/features/doctors/doctor-display';
import { useSpecialtiesFor } from '@/features/provider/use-provider';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { numberText, optionalNumberText, optionalText, requiredText } from '@/lib/form-fields';
import {
  bmdcNumberSchema,
  type MyProviderProfileResponse,
  type ProviderType,
  type RegisterProviderRequest,
  type UpdateProviderRequest,
} from '@/shared-contracts/doctors.contract';
import { colors } from '@/theme/design-tokens';

const fee = optionalNumberText({ min: 0, max: 100_000, step: 0.01, rangeMessage: '০ থেকে ১,০০,০০০ টাকা।' });

const formSchema = z
  .object({
    type: z.enum(['DOCTOR', 'NUTRITIONIST', 'PHYSIO']),
    gender: z.enum(['MALE', 'FEMALE'], { message: 'লিঙ্গ বেছে নিন।' }),
    displayName: requiredText(80, 'নাম লিখুন।').refine((v) => v.length >= 3, 'পুরো নাম লিখুন।'),
    bmdcNo: z.string().trim(),
    designation: optionalText(120),
    qualifications: requiredText(200, 'ডিগ্রি লিখুন, যেমন MBBS, FCPS।'),
    experienceYears: numberText({ min: 0, max: 70, step: 1, emptyMessage: 'কত বছরের অভিজ্ঞতা লিখুন।', rangeMessage: '০ থেকে ৭০ বছর।' }),
    bio: optionalText(1500),
    specialtyIds: z.array(z.string()).min(1, 'অন্তত একটি বিশেষজ্ঞতা বেছে নিন।').max(5, 'সর্বোচ্চ ৫টি।'),
    videoFee: fee,
    chatFee: fee,
    homeVisitFee: fee,
    acceptsQuickConsult: z.boolean(),
    offersHomeVisit: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.type !== 'DOCTOR') return;
    if (!bmdcNumberSchema.safeParse(v.bmdcNo).success) {
      ctx.addIssue({ code: 'custom', path: ['bmdcNo'], message: 'BMDC নম্বর লিখুন, যেমন A-12345।' });
    }
  });
type FormInput = z.input<typeof formSchema>;
type FormValues = z.output<typeof formSchema>;

const TYPES = (['DOCTOR', 'NUTRITIONIST', 'PHYSIO'] as const).map((value) => ({
  value,
  label: PROVIDER_TYPE_LABEL[value],
}));
const GENDERS = [
  { value: 'MALE' as const, label: 'পুরুষ' },
  { value: 'FEMALE' as const, label: 'নারী' },
];

const text = (n: number | null | undefined) => (n == null ? '' : String(n));

function defaults(p?: MyProviderProfileResponse): FormInput {
  return {
    type: p?.type ?? 'DOCTOR',
    gender: p?.gender ?? 'MALE',
    displayName: p?.displayName ?? '',
    bmdcNo: p?.bmdcNo ?? '',
    designation: p?.designation ?? '',
    qualifications: p?.qualifications ?? '',
    experienceYears: text(p?.experienceYears ?? 0),
    bio: p?.bio ?? '',
    specialtyIds: p?.specialties.map((s) => s.id) ?? [],
    videoFee: text(p?.fees.video),
    chatFee: text(p?.fees.chat),
    homeVisitFee: text(p?.fees.homeVisit),
    acceptsQuickConsult: p?.acceptsQuickConsult ?? false,
    offersHomeVisit: p?.offersHomeVisit ?? false,
  };
}

interface Props {
  /** Editing; without it the form registers a new provider. */
  profile?: MyProviderProfileResponse;
  submitting: boolean;
  error: unknown;
  onRegister?: (body: RegisterProviderRequest) => void;
  onUpdate?: (body: UpdateProviderRequest) => void;
}

/** Name, BMDC, degrees, specialties, bio and (when editing) fees and options. */
export function ProviderProfileForm({ profile, submitting, error, onRegister, onUpdate }: Props) {
  const editing = Boolean(profile);
  const form = useForm<FormInput, unknown, FormValues>({ resolver: zodResolver(formSchema), defaultValues: defaults(profile) });
  const errors = form.formState.errors;
  const type = useWatch({ control: form.control, name: 'type' }) as ProviderType;
  const specialties = useSpecialtiesFor(type);

  const submit = form.handleSubmit((v) => {
    const common = {
      gender: v.gender,
      displayName: v.displayName,
      designation: v.designation,
      qualifications: v.qualifications,
      experienceYears: v.experienceYears,
      bio: v.bio,
      specialtyIds: v.specialtyIds,
    };
    if (!editing) {
      onRegister?.({ ...common, type: v.type, ...(v.type === 'DOCTOR' ? { bmdcNo: v.bmdcNo } : {}) });
      return;
    }
    onUpdate?.({
      ...common,
      ...(profile?.type === 'DOCTOR' && v.bmdcNo !== profile.bmdcNo ? { bmdcNo: v.bmdcNo } : {}),
      videoFee: v.videoFee,
      chatFee: v.chatFee,
      homeVisitFee: v.homeVisitFee,
      acceptsQuickConsult: v.acceptsQuickConsult,
      offersHomeVisit: v.offersHomeVisit,
    });
  });

  return (
    <View className="gap-5">
      {!editing ? (
        <Controller
          control={form.control}
          name="type"
          render={({ field }) => (
            <ChipSelect
              label="আপনি কী হিসেবে সেবা দেবেন?"
              options={TYPES}
              value={field.value}
              onChange={(value) => {
                field.onChange(value);
                form.setValue('specialtyIds', []);
              }}
            />
          )}
        />
      ) : null}

      <Controller
        control={form.control}
        name="displayName"
        render={({ field }) => (
          <LabeledTextInput
            label="নাম"
            helperText={type === 'DOCTOR' ? '"ডা." লিখবেন না; অ্যাপ নিজে যোগ করবে।' : undefined}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            errorText={errors.displayName?.message}
          />
        )}
      />

      <Controller
        control={form.control}
        name="gender"
        render={({ field }) => (
          <ChipSelect label="লিঙ্গ" options={GENDERS} value={field.value} onChange={field.onChange} errorText={errors.gender?.message} />
        )}
      />

      {type === 'DOCTOR' ? (
        <Controller
          control={form.control}
          name="bmdcNo"
          render={({ field }) => (
            <LabeledTextInput
              label="BMDC নিবন্ধন নম্বর"
              placeholder="A-12345"
              autoCapitalize="characters"
              helperText={editing ? 'বদলালে আবার যাচাই হবে।' : 'অ্যাডমিন যাচাই করার পর রোগীরা আপনাকে দেখবেন।'}
              value={field.value}
              onChangeText={field.onChange}
              errorText={errors.bmdcNo?.message}
            />
          )}
        />
      ) : null}

      <Controller
        control={form.control}
        name="qualifications"
        render={({ field }) => (
          <LabeledTextInput label="ডিগ্রি" placeholder="MBBS, FCPS (Medicine)" value={field.value} onChangeText={field.onChange} errorText={errors.qualifications?.message} />
        )}
      />
      <Controller
        control={form.control}
        name="designation"
        render={({ field }) => (
          <LabeledTextInput label="পদবি (ঐচ্ছিক)" placeholder="সহযোগী অধ্যাপক, মেডিসিন বিভাগ" value={field.value ?? ''} onChangeText={field.onChange} errorText={errors.designation?.message} />
        )}
      />
      <Controller
        control={form.control}
        name="experienceYears"
        render={({ field }) => (
          <LabeledTextInput label="অভিজ্ঞতা (বছর)" keyboardType="number-pad" value={field.value} onChangeText={field.onChange} errorText={errors.experienceYears?.message} />
        )}
      />

      <Controller
        control={form.control}
        name="specialtyIds"
        render={({ field }) => (
          <View className="gap-2">
            <BanglaText variant="label">বিশেষজ্ঞতা (সর্বোচ্চ ৫টি)</BanglaText>
            {specialties.isLoading ? (
              <SkeletonBlock className="h-24" />
            ) : (
              <View className="flex-row flex-wrap gap-2">
                {(specialties.data ?? []).map((s) => {
                  const selected = field.value.includes(s.id);
                  return (
                    <Pressable
                      key={s.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      onPress={() =>
                        field.onChange(selected ? field.value.filter((id) => id !== s.id) : [...field.value, s.id].slice(0, 5))
                      }
                      className={`min-h-[44px] flex-row items-center gap-1.5 rounded-full border px-4 ${selected ? 'border-primary bg-primary' : 'border-line bg-surface-card'}`}>
                      {selected ? <Check size={16} color={colors.white} /> : null}
                      <BanglaText className={`text-[14px] ${selected ? 'font-bangla-semibold text-white' : 'font-bangla-medium text-ink'}`}>
                        {s.nameBn}
                      </BanglaText>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {errors.specialtyIds?.message ? (
              <BanglaText variant="caption" className="text-danger">
                {errors.specialtyIds.message}
              </BanglaText>
            ) : null}
          </View>
        )}
      />

      <Controller
        control={form.control}
        name="bio"
        render={({ field }) => (
          <LabeledTextInput
            label="নিজের সম্পর্কে (ঐচ্ছিক)"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            style={{ minHeight: 96 }}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            errorText={errors.bio?.message}
          />
        )}
      />

      {editing ? (
        <>
          <BanglaText variant="heading">অনলাইন ফি</BanglaText>
          <BanglaText variant="caption">খালি রাখলে সেই সেবা বন্ধ থাকবে। চেম্বারের ফি চেম্বারের সাথে থাকে।</BanglaText>
          {(['videoFee', 'chatFee', 'homeVisitFee'] as const).map((name) => (
            <Controller
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <LabeledTextInput
                  label={name === 'videoFee' ? 'ভিডিও কলের ফি (৳)' : name === 'chatFee' ? 'চ্যাটের ফি (৳)' : 'হোম ভিজিটের ফি (৳)'}
                  keyboardType="decimal-pad"
                  value={field.value ?? ''}
                  onChangeText={field.onChange}
                  errorText={errors[name]?.message}
                />
              )}
            />
          ))}
          <Controller
            control={form.control}
            name="acceptsQuickConsult"
            render={({ field }) => (
              <SwitchRow
                title="দ্রুত পরামর্শ নেব"
                subtitle="অনলাইনে থাকলে টাকা দিয়ে অপেক্ষারত রোগীদের চ্যাটে উত্তর দিতে পারবেন"
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <Controller
            control={form.control}
            name="offersHomeVisit"
            render={({ field }) => (
              <SwitchRow title="হোম ভিজিট করি" value={field.value} onChange={field.onChange} />
            )}
          />
        </>
      ) : null}

      <FormErrorBanner message={error ? apiErrorMessage(error) : null} />
      <ActionButton
        label={editing ? 'সেভ করুন' : `${PROVIDER_TYPE_LABEL[type]} হিসেবে নিবন্ধন করুন`}
        icon={Save}
        loading={submitting}
        onPress={() => void submit()}
      />
      {Object.keys(errors).length > 0 ? (
        <BanglaText variant="caption" className="text-center text-danger">
          {toBanglaDigits(Object.keys(errors).length)}টি ঘর ঠিক করুন।
        </BanglaText>
      ) : null}
    </View>
  );
}
