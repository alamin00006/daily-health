import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { Mail, Send } from 'lucide-react-native';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { View } from 'react-native';
import { z } from 'zod';

import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ChipSelect } from '@/components/ui/chip-select';
import { FormErrorBanner, InlineAlert } from '@/components/ui/form-error-banner';
import { LabeledTextInput } from '@/components/ui/labeled-text-input';
import { ScreenContainer } from '@/components/ui/screen-container';
import { ScreenHeader } from '@/components/ui/screen-header';
import { apiErrorMessage } from '@/api/api-error-messages';
import {
  RELATION_LABELS,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
} from '@/features/profiles/profile-permissions';
import { useActiveProfile, useCreateInvite } from '@/features/profiles/use-profiles';
import { showToast } from '@/lib/user-feedback';
import { emailSchema } from '@/shared-contracts/common-fields.contract';
import type { ProfileRelation, ProfileRole } from '@/shared-contracts/profiles.contract';

const inviteFormSchema = z.object({
  email: z.string().transform((value, ctx) => {
    if (value.trim() === '') {
      ctx.addIssue({ code: 'custom', message: 'ইমেইল ঠিকানা লিখুন।' });
      return z.NEVER;
    }
    const parsed = emailSchema.safeParse(value);
    if (!parsed.success) {
      ctx.addIssue({ code: 'custom', message: 'সঠিক ইমেইল ঠিকানা লিখুন।' });
      return z.NEVER;
    }
    return parsed.data;
  }),
  role: z.enum(['OWNER', 'CAREGIVER', 'VIEWER']),
  relation: z.enum(['SELF', 'FATHER', 'MOTHER', 'CHILD', 'SPOUSE', 'OTHER'], {
    message: 'রোগী তার কে হন, বেছে নিন।',
  }),
});
type InviteFormInput = z.input<typeof inviteFormSchema>;
type InviteFormValues = z.output<typeof inviteFormSchema>;

const ROLE_OPTIONS = (['CAREGIVER', 'VIEWER', 'OWNER'] as ProfileRole[]).map((value) => ({
  value,
  label: ROLE_LABELS[value],
}));

export default function InviteMemberScreen() {
  const { profile } = useActiveProfile();
  const invite = useCreateInvite(profile?.id ?? '');
  const { control, handleSubmit } = useForm<InviteFormInput, unknown, InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: { email: '', role: 'CAREGIVER', relation: undefined },
  });
  const role = useWatch({ control, name: 'role' });

  // "SELF": the invitee is the patient (links their own account), offered only if not linked yet.
  const relationOptions = (Object.keys(RELATION_LABELS) as ProfileRelation[])
    .filter((r) => r !== 'SELF' || !profile?.hasLinkedAccount)
    .map((value) => ({
      value,
      label: value === 'SELF' ? `${profile?.fullName ?? 'রোগী'} নিজে` : RELATION_LABELS[value],
    }));

  const submit = handleSubmit((values) =>
    invite.mutate(values, {
      onSuccess: () => {
        showToast('আমন্ত্রণ পাঠানো হয়েছে');
        router.back();
      },
    })
  );

  return (
    <ScreenContainer
      header={
        <ScreenHeader
          title="আমন্ত্রণ জানান"
          subtitle={profile?.fullName}
          backIcon="close"
          fallbackHref="/family"
        />
      }
      footer={
        <ActionButton
          label="আমন্ত্রণ পাঠান"
          icon={Send}
          loading={invite.isPending}
          onPress={() => void submit()}
        />
      }>
      <InlineAlert message="তার ইমেইলে একটি বার্তা যাবে। তিনি ওই ইমেইল দিয়ে অ্যাপে লগইন করে আমন্ত্রণ গ্রহণ করবেন। আমন্ত্রণ ৭ দিন থাকে।" />

      <Controller
        control={control}
        name="email"
        render={({ field, fieldState }) => (
          <LabeledTextInput
            label="তার ইমেইল"
            icon={Mail}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            placeholder="example@mail.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            errorText={fieldState.error?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="relation"
        render={({ field, fieldState }) => (
          <ChipSelect
            label={`${profile?.fullName ?? 'রোগী'} তার কে হন?`}
            options={relationOptions}
            value={field.value}
            onChange={field.onChange}
            errorText={fieldState.error?.message}
          />
        )}
      />

      <View className="gap-2">
        <Controller
          control={control}
          name="role"
          render={({ field }) => (
            <ChipSelect
              label="তিনি কী করতে পারবেন?"
              options={ROLE_OPTIONS}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <BanglaText variant="caption">{ROLE_DESCRIPTIONS[role]}</BanglaText>
      </View>

      <FormErrorBanner message={invite.error ? apiErrorMessage(invite.error) : null} />
    </ScreenContainer>
  );
}
