import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { LogIn, Mail, MailCheck } from 'lucide-react-native';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';

import { isApiError } from '@/api/api-error';
import { AuthScreenHeader } from '@/components/auth/auth-screen-header';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { DigitCodeInput } from '@/components/ui/digit-code-input';
import { DividerWithLabel } from '@/components/ui/divider-with-label';
import { FormErrorBanner } from '@/components/ui/form-error-banner';
import { LabeledTextInput } from '@/components/ui/labeled-text-input';
import { ScreenContainer } from '@/components/ui/screen-container';
import { TextLink } from '@/components/ui/text-link';
import { authErrorMessage } from '@/features/auth/auth-error-messages';
import {
  loginFormSchema,
  type LoginFormInput,
  type LoginFormValues,
} from '@/features/auth/auth-form-schemas';
import { useLoginWithPinMutation } from '@/features/auth/use-auth-mutations';

export default function LoginScreen() {
  const login = useLoginWithPinMutation();
  const { control, handleSubmit, resetField } = useForm<LoginFormInput, unknown, LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', pin: '' },
  });

  // `values` are the parsed output: the email is already trimmed and lowercased.
  const submit = handleSubmit((values) =>
    login.mutate(values, {
      // A wrong PIN is cleared so the next try starts fresh.
      onError: () => resetField('pin'),
    })
  );

  const pinLocked = isApiError(login.error) && login.error.code === 'PIN_LOCKED';

  return (
    <ScreenContainer
      footer={
        <View className="flex-row items-center justify-center gap-1">
          <BanglaText variant="label" className="font-bangla text-ink-muted">
            অ্যাকাউন্ট নেই?
          </BanglaText>
          <TextLink
            label="নতুন অ্যাকাউন্ট খুলুন"
            onPress={() =>
              router.replace({ pathname: '/request-code', params: { purpose: 'SIGNUP' } })
            }
          />
        </View>
      }>
      <AuthScreenHeader
        title="আবার স্বাগতম"
        subtitle="আপনার ইমেইল আর ৬ সংখ্যার পিন দিয়ে লগইন করুন।"
      />

      <View className="gap-6">
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
              errorText={fieldState.error?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="pin"
          render={({ field, fieldState }) => (
            <View className="gap-2">
              <View className="flex-row items-center justify-between">
                <BanglaText variant="label">পিন</BanglaText>
                <TextLink
                  label="পিন ভুলে গেছেন?"
                  variant="caption"
                  onPress={() =>
                    router.push({ pathname: '/request-code', params: { purpose: 'RESET_PIN' } })
                  }
                />
              </View>
              <DigitCodeInput
                kind="pin"
                masked
                value={field.value}
                onChange={field.onChange}
                onComplete={() => void submit()}
                accessibilityLabel="৬ সংখ্যার পিন"
                hasError={Boolean(fieldState.error || login.error)}
              />
              {fieldState.error ? (
                <BanglaText variant="caption" className="text-danger">
                  {fieldState.error.message}
                </BanglaText>
              ) : null}
            </View>
          )}
        />

        <FormErrorBanner message={login.error ? authErrorMessage(login.error) : null} />

        <ActionButton
          label="লগইন"
          icon={LogIn}
          loading={login.isPending}
          onPress={() => void submit()}
        />

        <DividerWithLabel label="অথবা" />

        <ActionButton
          label="ইমেইলে কোড নিয়ে লগইন"
          icon={MailCheck}
          // When the PIN is locked this is the way in, so it is promoted.
          variant={pinLocked ? 'primary' : 'secondary'}
          onPress={() => router.push({ pathname: '/request-code', params: { purpose: 'LOGIN' } })}
        />
      </View>
    </ScreenContainer>
  );
}
