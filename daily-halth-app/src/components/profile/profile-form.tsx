import { zodResolver } from '@hookform/resolvers/zod';
import { Check, MapPin, UserRound } from 'lucide-react-native';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { z } from 'zod';

import { ActionButton } from '@/components/ui/action-button';
import { ChipSelect } from '@/components/ui/chip-select';
import { DateField } from '@/components/ui/date-time-field';
import { FormErrorBanner } from '@/components/ui/form-error-banner';
import { LabeledTextInput } from '@/components/ui/labeled-text-input';
import { apiErrorMessage } from '@/api/api-error-messages';
import { RELATION_LABELS } from '@/features/profiles/profile-permissions';
import { optionalNumberText, optionalText, requiredText } from '@/lib/form-fields';
import { toBanglaDigits } from '@/lib/bangla-digits';
import type {
  CreateProfileRequest,
  PatientProfileResponse,
  ProfileRelation,
} from '@/shared-contracts/profiles.contract';

const profileFormSchema = z.object({
  fullName: requiredText(100, 'নাম লিখুন।'),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER'], { message: 'লিঙ্গ বেছে নিন।' }),
  relation: z.enum(['SELF', 'FATHER', 'MOTHER', 'CHILD', 'SPOUSE', 'OTHER'], {
    message: 'আপনার সাথে সম্পর্ক বেছে নিন।',
  }),
  dateOfBirth: z.string().nullable(),
  bloodGroup: z
    .enum(['A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG'])
    .nullable(),
  heightCm: optionalNumberText({
    min: 30,
    max: 250,
    step: 0.1,
    rangeMessage: '৩০ থেকে ২৫০ সেমির মধ্যে লিখুন।',
  }),
  district: optionalText(64),
});
type ProfileFormInput = z.input<typeof profileFormSchema>;
type ProfileFormValues = z.output<typeof profileFormSchema>;

const GENDERS = [
  { value: 'MALE' as const, label: 'পুরুষ' },
  { value: 'FEMALE' as const, label: 'নারী' },
  { value: 'OTHER' as const, label: 'অন্যান্য' },
];
const BLOOD_GROUPS = [
  ['A_POS', 'A+'],
  ['A_NEG', 'A−'],
  ['B_POS', 'B+'],
  ['B_NEG', 'B−'],
  ['O_POS', 'O+'],
  ['O_NEG', 'O−'],
  ['AB_POS', 'AB+'],
  ['AB_NEG', 'AB−'],
].map(([value, label]) => ({
  value: value as NonNullable<ProfileFormInput['bloodGroup']>,
  label: label!,
}));

interface ProfileFormProps {
  /** Editing an existing profile (relation cannot change then). */
  profile?: PatientProfileResponse;
  /** Preselected relation for a new profile ("নিজের প্রোফাইল"). */
  initialRelation?: ProfileRelation;
  /** The user already has an own profile: SELF is not offered. */
  hasOwnProfile: boolean;
  submitLabel: string;
  submitting: boolean;
  error: unknown;
  onSubmit: (values: CreateProfileRequest) => void;
}

/** Name, gender, relation, date of birth, blood group, height and district. */
export function ProfileForm({
  profile,
  initialRelation,
  hasOwnProfile,
  submitLabel,
  submitting,
  error,
  onSubmit,
}: ProfileFormProps) {
  const { control, handleSubmit } = useForm<ProfileFormInput, unknown, ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      fullName: profile?.fullName ?? '',
      gender: profile?.gender,
      relation: profile?.myRelation ?? initialRelation ?? (hasOwnProfile ? undefined : 'SELF'),
      dateOfBirth: profile?.dateOfBirth ?? null,
      bloodGroup: profile?.bloodGroup ?? null,
      heightCm: profile?.heightCm ? toBanglaDigits(profile.heightCm) : '',
      district: profile?.district ?? '',
    },
  });

  const relations = (Object.keys(RELATION_LABELS) as ProfileRelation[])
    .filter((r) => r !== 'SELF' || !hasOwnProfile || profile?.myRelation === 'SELF')
    .map((value) => ({ value, label: value === 'SELF' ? 'আমি নিজে' : RELATION_LABELS[value] }));

  const submit = handleSubmit((values) =>
    onSubmit({
      fullName: values.fullName,
      gender: values.gender,
      relation: values.relation,
      dateOfBirth: values.dateOfBirth,
      bloodGroup: values.bloodGroup,
      heightCm: values.heightCm,
      district: values.district,
    })
  );

  return (
    <View className="gap-5">
      {!profile ? (
        <Controller
          control={control}
          name="relation"
          render={({ field, fieldState }) => (
            <ChipSelect
              label="এই প্রোফাইলটি কার?"
              options={relations}
              value={field.value}
              onChange={field.onChange}
              errorText={fieldState.error?.message}
            />
          )}
        />
      ) : null}

      <Controller
        control={control}
        name="fullName"
        render={({ field, fieldState }) => (
          <LabeledTextInput
            label="পুরো নাম"
            icon={UserRound}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            placeholder="যেমন: আব্দুল করিম"
            autoCapitalize="words"
            errorText={fieldState.error?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="gender"
        render={({ field, fieldState }) => (
          <ChipSelect
            label="লিঙ্গ"
            options={GENDERS}
            value={field.value}
            onChange={field.onChange}
            errorText={fieldState.error?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="dateOfBirth"
        render={({ field }) => (
          <DateField
            label="জন্মতারিখ (ঐচ্ছিক)"
            value={field.value}
            onChange={field.onChange}
            maximumDate={new Date()}
            minimumDate={new Date(1900, 0, 1)}
            clearable
          />
        )}
      />

      <Controller
        control={control}
        name="bloodGroup"
        render={({ field }) => (
          <ChipSelect
            label="রক্তের গ্রুপ (ঐচ্ছিক)"
            options={BLOOD_GROUPS}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />

      <Controller
        control={control}
        name="heightCm"
        render={({ field, fieldState }) => (
          <LabeledTextInput
            label="উচ্চতা, সেন্টিমিটারে (ঐচ্ছিক)"
            helperText="ওজনের সাথে BMI হিসাব করতে লাগে। ৫ ফুট ৬ ইঞ্চি ≈ ১৬৮ সেমি।"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            placeholder="যেমন: ১৬৫"
            keyboardType="decimal-pad"
            errorText={fieldState.error?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="district"
        render={({ field, fieldState }) => (
          <LabeledTextInput
            label="জেলা (ঐচ্ছিক)"
            icon={MapPin}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            placeholder="যেমন: কুমিল্লা"
            errorText={fieldState.error?.message}
          />
        )}
      />

      <FormErrorBanner message={error ? apiErrorMessage(error) : null} />
      <ActionButton
        label={submitLabel}
        icon={Check}
        loading={submitting}
        onPress={() => void submit()}
      />
    </View>
  );
}
