import { zodResolver } from '@hookform/resolvers/zod';
import { Redirect, router } from 'expo-router';
import { Check, LockKeyhole, RotateCcw, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';

import { isApiError } from '@/api/api-error';
import { AuthScreenHeader } from '@/components/auth/auth-screen-header';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { DigitCodeInput } from '@/components/ui/digit-code-input';
import { FormErrorBanner } from '@/components/ui/form-error-banner';
import { ScreenContainer } from '@/components/ui/screen-container';
import { StepIndicator } from '@/components/ui/step-indicator';
import { SurfaceCard } from '@/components/ui/surface-card';
import { authErrorMessage } from '@/features/auth/auth-error-messages';
import {
  setPinFormSchema,
  type SetPinFormInput,
  type SetPinFormValues,
} from '@/features/auth/auth-form-schemas';
import { useSetPinMutation } from '@/features/auth/use-auth-mutations';
import { useAuthFlowStore } from '@/stores/auth-flow-store';
import { colors } from '@/theme/design-tokens';

type Step = 'choose' | 'confirm';

/** The first two are the rules pinSchema enforces; the last one is advice. */
const PIN_TIPS = [
  'একই সংখ্যা বারবার (১১১১১১) দেওয়া যাবে না',
  'ক্রমিক সংখ্যা (১২৩৪৫৬, ৬৫৪৩২১) দেওয়া যাবে না',
  'জন্মসাল বা ফোন নম্বরের অংশ এড়িয়ে চলুন',
];

/** Step 3 of signup and PIN reset: choose a 6-digit PIN and type it again. */
export default function SetPinScreen() {
  const purpose = useAuthFlowStore((s) => s.purpose);
  const verificationToken = useAuthFlowStore((s) => s.verificationToken);
  const resetFlow = useAuthFlowStore((s) => s.reset);
  const [step, setStep] = useState<Step>('choose');
  /** Shown after a mismatch, which sends the user back to step 1 with an empty form. */
  const [mismatchNotice, setMismatchNotice] = useState<string | null>(null);
  const setPinMutation = useSetPinMutation();
  const { control, trigger, handleSubmit, reset, resetField, formState } = useForm<
    SetPinFormInput,
    unknown,
    SetPinFormValues
  >({
    resolver: zodResolver(setPinFormSchema),
    defaultValues: { pin: '', confirmation: '' },
  });

  if (!verificationToken || (purpose !== 'SIGNUP' && purpose !== 'RESET_PIN')) {
    return <Redirect href="/welcome" />;
  }

  const isSignup = purpose === 'SIGNUP';

  const choosePin = async () => {
    setMismatchNotice(null);
    // Checks only the PIN rules here; the match is checked after step 2.
    if (await trigger('pin')) {
      setStep('confirm');
    } else {
      resetField('pin', { keepError: true });
    }
  };

  const startOver = (notice: string | null) => {
    reset({ pin: '', confirmation: '' });
    setPinMutation.reset();
    setMismatchNotice(notice);
    setStep('choose');
  };

  const submit = handleSubmit(
    ({ pin }) => setPinMutation.mutate({ purpose, verificationToken, pin }),
    (errors) => {
      if (errors.confirmation) startOver(errors.confirmation.message ?? null);
    }
  );

  // The verification ran out (10 minutes) or was used: the code must be verified again.
  const tokenExpired =
    isApiError(setPinMutation.error) && setPinMutation.error.code === 'VERIFICATION_TOKEN_INVALID';

  const fieldError = step === 'choose' ? formState.errors.pin?.message : undefined;

  const footer = tokenExpired ? (
    <ActionButton
      label="আবার শুরু করুন"
      icon={RotateCcw}
      onPress={() => {
        resetFlow();
        router.replace({ pathname: '/request-code', params: { purpose } });
      }}
    />
  ) : step === 'confirm' ? (
    <>
      <ActionButton
        label={isSignup ? 'অ্যাকাউন্ট খুলুন' : 'নতুন পিন সেভ করুন'}
        icon={Check}
        loading={setPinMutation.isPending}
        onPress={() => void submit()}
      />
      <ActionButton
        label="অন্য পিন বেছে নিন"
        variant="ghost"
        size="sm"
        onPress={() => startOver(null)}
      />
    </>
  ) : null;

  return (
    <ScreenContainer footer={footer}>
      <AuthScreenHeader
        icon={step === 'choose' ? LockKeyhole : ShieldCheck}
        eyebrow={<StepIndicator current={3} total={3} />}
        title={
          step === 'choose'
            ? isSignup
              ? 'একটি পিন বেছে নিন'
              : 'নতুন পিন সেট করুন'
            : 'পিনটি আবার দিন'
        }
        subtitle={
          step === 'choose'
            ? 'প্রতিবার লগইনে এই ৬ সংখ্যার পিন লাগবে। পিনটি কাউকে জানাবেন না।'
            : 'ভুল এড়াতে একই পিন আরেকবার দিন।'
        }
      />

      <View className="gap-5">
        {step === 'choose' ? (
          <Controller
            key="choose"
            control={control}
            name="pin"
            render={({ field }) => (
              <DigitCodeInput
                kind="pin"
                masked
                autoFocus
                value={field.value}
                onChange={field.onChange}
                onComplete={() => void choosePin()}
                accessibilityLabel="নতুন ৬ সংখ্যার পিন"
                hasError={Boolean(fieldError || mismatchNotice)}
              />
            )}
          />
        ) : (
          <Controller
            key="confirm"
            control={control}
            name="confirmation"
            render={({ field }) => (
              <DigitCodeInput
                kind="pin"
                masked
                autoFocus
                value={field.value}
                onChange={field.onChange}
                onComplete={() => void submit()}
                accessibilityLabel="একই পিন আবার"
                hasError={Boolean(setPinMutation.error)}
              />
            )}
          />
        )}

        <FormErrorBanner
          message={
            fieldError ??
            mismatchNotice ??
            (setPinMutation.error ? authErrorMessage(setPinMutation.error) : null)
          }
        />

        {step === 'choose' && !tokenExpired ? (
          <SurfaceCard className="gap-3">
            <BanglaText variant="label" className="font-bangla-semibold">
              ভালো পিনের জন্য
            </BanglaText>
            {PIN_TIPS.map((tip) => (
              <View key={tip} className="flex-row items-start gap-2.5">
                <View className="mt-[3px] h-5 w-5 items-center justify-center rounded-full bg-primary-100">
                  <Check size={12} color={colors.primary} strokeWidth={3} />
                </View>
                <BanglaText variant="label" className="flex-1 font-bangla text-ink-muted">
                  {tip}
                </BanglaText>
              </View>
            ))}
          </SurfaceCard>
        ) : null}
      </View>
    </ScreenContainer>
  );
}
