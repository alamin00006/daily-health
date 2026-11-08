import { Redirect, router } from 'expo-router';
import { Clock3, MailOpen, RotateCw, ShieldCheck } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AuthScreenHeader } from '@/components/auth/auth-screen-header';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { DigitCodeInput } from '@/components/ui/digit-code-input';
import { FormErrorBanner } from '@/components/ui/form-error-banner';
import { ScreenContainer } from '@/components/ui/screen-container';
import { StepIndicator } from '@/components/ui/step-indicator';
import { TextLink } from '@/components/ui/text-link';
import { authErrorMessage } from '@/features/auth/auth-error-messages';
import { useSendCodeMutation, useVerifyCodeMutation } from '@/features/auth/use-auth-mutations';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { useAuthFlowStore } from '@/stores/auth-flow-store';
import { colors } from '@/theme/design-tokens';

/** Seconds until "send again" is allowed, ticking once a second. */
function useSecondsUntil(timestampMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.ceil((timestampMs - now) / 1000));
}

/** "০:৪৫" */
function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return toBanglaDigits(`${minutes}:${seconds}`);
}

/** Step 2: type the 6-digit code from the email. */
export default function VerifyCodeScreen() {
  const email = useAuthFlowStore((s) => s.email);
  const purpose = useAuthFlowStore((s) => s.purpose);
  const resendAvailableAt = useAuthFlowStore((s) => s.resendAvailableAt);
  const [code, setCode] = useState('');
  const verify = useVerifyCodeMutation();
  const resend = useSendCodeMutation();
  const resendInSec = useSecondsUntil(resendAvailableAt);

  // Opened directly (e.g. after the app was restarted): start over.
  if (!email || !purpose) return <Redirect href="/welcome" />;

  const submit = (value: string) => {
    resend.reset();
    verify.mutate(
      { email, purpose, code: value },
      {
        onSuccess: (result) => {
          // LOGIN is finished here; the session change moves the user to home.
          if (!result.loggedIn) router.replace('/set-pin');
        },
        onError: () => setCode(''),
      }
    );
  };

  const error = verify.error ?? resend.error;

  return (
    <ScreenContainer
      footer={
        <ActionButton
          label="যাচাই করুন"
          icon={ShieldCheck}
          loading={verify.isPending}
          disabled={code.length !== 6}
          onPress={() => submit(code)}
        />
      }>
      <AuthScreenHeader
        title="ইমেইলে পাঠানো কোড দিন"
        icon={MailOpen}
        eyebrow={purpose === 'LOGIN' ? undefined : <StepIndicator current={2} total={3} />}
        subtitle={
          <View className="gap-2">
            <BanglaText className="text-ink-muted">
              ৬ সংখ্যার কোডটি এই ঠিকানায় পাঠানো হয়েছে:
            </BanglaText>
            <View className="flex-row flex-wrap items-center gap-x-3">
              <BanglaText variant="body-strong" className="shrink">
                {email}
              </BanglaText>
              <TextLink label="ইমেইল বদলান" variant="caption" onPress={() => router.back()} />
            </View>
          </View>
        }
      />

      <View className="gap-5">
        <DigitCodeInput
          kind="one-time-code"
          value={code}
          onChange={setCode}
          onComplete={submit}
          autoFocus
          accessibilityLabel="ইমেইলে পাওয়া ৬ সংখ্যার কোড"
          hasError={Boolean(verify.error)}
        />

        <FormErrorBanner message={error ? authErrorMessage(error) : null} />

        <View className="items-center">
          {resendInSec > 0 ? (
            <View className="min-h-touch flex-row items-center gap-2">
              <Clock3 size={16} color={colors.inkMuted} strokeWidth={2} />
              <BanglaText variant="label" className="font-bangla text-ink-muted">
                আবার কোড চাইতে পারবেন {formatCountdown(resendInSec)} পরে
              </BanglaText>
            </View>
          ) : (
            <ActionButton
              label="আবার কোড পাঠান"
              icon={RotateCw}
              variant="ghost"
              size="sm"
              fullWidth={false}
              loading={resend.isPending}
              onPress={() => {
                verify.reset();
                setCode('');
                resend.mutate({ email, purpose });
              }}
            />
          )}
        </View>
      </View>
    </ScreenContainer>
  );
}
