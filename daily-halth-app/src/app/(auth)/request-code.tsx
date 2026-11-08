import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import {
  KeyRound,
  Mail,
  MailCheck,
  Send,
  UserRoundPlus,
  type LucideIcon,
} from 'lucide-react-native';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';

import { AuthScreenHeader } from '@/components/auth/auth-screen-header';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { FormErrorBanner, InlineAlert } from '@/components/ui/form-error-banner';
import { LabeledTextInput } from '@/components/ui/labeled-text-input';
import { ScreenContainer } from '@/components/ui/screen-container';
import { StepIndicator } from '@/components/ui/step-indicator';
import { TextLink } from '@/components/ui/text-link';
import { authErrorMessage } from '@/features/auth/auth-error-messages';
import {
  requestCodeFormSchema,
  type RequestCodeFormInput,
  type RequestCodeFormValues,
} from '@/features/auth/auth-form-schemas';
import { useSendCodeMutation } from '@/features/auth/use-auth-mutations';
import { otpPurposeSchema, type OtpPurpose } from '@/shared-contracts/auth.contract';

const COPY: Record<OtpPurpose, { title: string; subtitle: string; icon: LucideIcon }> = {
  SIGNUP: {
    title: 'নতুন অ্যাকাউন্ট খুলুন',
    subtitle: 'আপনার ইমেইল দিন। সেখানে একটি ৬ সংখ্যার যাচাই কোড পাঠানো হবে।',
    icon: UserRoundPlus,
  },
  LOGIN: {
    title: 'ইমেইল কোড দিয়ে লগইন',
    subtitle: 'আপনার অ্যাকাউন্টের ইমেইলে একটি ৬ সংখ্যার কোড পাঠানো হবে।',
    icon: MailCheck,
  },
  RESET_PIN: {
    title: 'পিন ভুলে গেছেন?',
    subtitle: 'চিন্তা নেই। ইমেইলে পাঠানো কোড যাচাই করে নতুন পিন সেট করুন।',
    icon: KeyRound,
  },
};

/** Flows that continue to the PIN step after the code: signup and PIN reset have 3 steps. */
const HAS_PIN_STEP: Record<OtpPurpose, boolean> = { SIGNUP: true, LOGIN: false, RESET_PIN: true };

/** Step 1 of signup, code login and PIN reset: enter the email, get a code. */
export default function RequestCodeScreen() {
  const params = useLocalSearchParams<{ purpose?: string }>();
  const purpose = otpPurposeSchema.catch('SIGNUP').parse(params.purpose);
  const sendCode = useSendCodeMutation();
  const { control, handleSubmit } = useForm<RequestCodeFormInput, unknown, RequestCodeFormValues>({
    resolver: zodResolver(requestCodeFormSchema),
    defaultValues: { email: '' },
  });

  const submit = handleSubmit(({ email }) =>
    sendCode.mutate({ email, purpose }, { onSuccess: () => router.push('/verify-code') })
  );

  const copy = COPY[purpose];

  return (
    <ScreenContainer
      footer={
        <>
          <ActionButton
            label="কোড পাঠান"
            icon={Send}
            loading={sendCode.isPending}
            onPress={() => void submit()}
          />
          {purpose === 'SIGNUP' ? (
            <View className="flex-row items-center justify-center gap-1">
              <BanglaText variant="label" className="font-bangla text-ink-muted">
                আগে থেকেই অ্যাকাউন্ট আছে?
              </BanglaText>
              <TextLink label="লগইন করুন" onPress={() => router.replace('/login')} />
            </View>
          ) : null}
        </>
      }>
      <AuthScreenHeader
        title={copy.title}
        subtitle={copy.subtitle}
        icon={copy.icon}
        eyebrow={HAS_PIN_STEP[purpose] ? <StepIndicator current={1} total={3} /> : undefined}
      />

      <View className="gap-5">
        <Controller
          control={control}
          name="email"
          render={({ field, fieldState }) => (
            <LabeledTextInput
              label="ইমেইল"
              icon={Mail}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              placeholder="example@mail.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              autoFocus
              returnKeyType="send"
              onSubmitEditing={() => void submit()}
              errorText={fieldState.error?.message}
            />
          )}
        />
        <FormErrorBanner message={sendCode.error ? authErrorMessage(sendCode.error) : null} />
        {!sendCode.error ? (
          <InlineAlert message="কোড পৌঁছাতে এক মিনিট পর্যন্ত লাগতে পারে। ইনবক্সে না পেলে স্প্যাম ফোল্ডার দেখুন।" />
        ) : null}
      </View>
    </ScreenContainer>
  );
}
