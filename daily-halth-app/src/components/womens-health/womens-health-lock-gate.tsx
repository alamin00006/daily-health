import { router } from 'expo-router';
import { LockKeyhole } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LockPinSetup } from '@/components/womens-health/lock-pin-setup';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { DigitCodeInput } from '@/components/ui/digit-code-input';
import { IconBadge } from '@/components/ui/icon-badge';
import { SkeletonBlock } from '@/components/ui/state-views';
import {
  LOCK_PIN_LENGTH,
  hasLockPin,
  setLockPin,
  useWomensHealthLock,
} from '@/features/womens-health/womens-health-lock';

function LockScreen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-1 justify-center gap-6 px-6">
        <View className="items-center gap-3">
          <IconBadge icon={LockKeyhole} tone="rose" size="lg" />
          <BanglaText variant="title" className="text-center">
            নারীস্বাস্থ্য লক করা
          </BanglaText>
        </View>
        {children}
        <ActionButton label="ফিরে যান" variant="ghost" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}

function EnterPin({ profileId }: { profileId: string }) {
  const tryUnlock = useWomensHealthLock((s) => s.tryUnlock);
  const [value, setValue] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (pin: string) => {
    const result = await tryUnlock(profileId, pin);
    if (result === 'ok') {
      Keyboard.dismiss();
      return;
    }
    setValue('');
    setMessage(
      result === 'blocked' ? 'অনেকবার ভুল হয়েছে। ৩০ সেকেন্ড পরে আবার চেষ্টা করুন।' : 'PIN মেলেনি। আবার দিন।'
    );
  };

  return (
    <View className="gap-3">
      <BanglaText className="text-center">খুলতে আপনার ৪ সংখ্যার লক PIN দিন</BanglaText>
      <View className="self-center" style={{ width: 4 * 64 }}>
        <DigitCodeInput
          value={value}
          onChange={(v) => {
            setMessage(null);
            setValue(v);
          }}
          onComplete={(pin) => void submit(pin)}
          length={LOCK_PIN_LENGTH}
          masked
          autoFocus
          kind="pin"
          hasError={Boolean(message)}
          accessibilityLabel="লক PIN"
        />
      </View>
      {message ? (
        <BanglaText variant="caption" className="text-center text-danger">
          {message}
        </BanglaText>
      ) : null}
      <BanglaText variant="caption" className="text-center">
        PIN ভুলে গেলে সেটিংস থেকে লগআউট করে আবার লগইন করুন, তারপর নতুন PIN দিন।
      </BanglaText>
    </View>
  );
}

/**
 * Asks for the on-device PIN before the section opens, when the lock is on.
 * On a phone without the PIN (new phone, or after signing in again) the
 * signed-in patient sets a new one.
 */
export function WomensHealthLockGate({
  profileId,
  enabled,
  children,
}: {
  profileId: string;
  enabled: boolean;
  children: ReactNode;
}) {
  const unlocked = useWomensHealthLock((s) => Boolean(s.unlocked[profileId]));
  const markUnlocked = useWomensHealthLock((s) => s.markUnlocked);
  const [pinState, setPinState] = useState<{ profileId: string; hasPin: boolean } | null>(null);
  const needsCheck = enabled && !unlocked;

  useEffect(() => {
    if (!needsCheck) return;
    let cancelled = false;
    void hasLockPin(profileId).then((hasPin) => {
      if (!cancelled) setPinState({ profileId, hasPin });
    });
    return () => {
      cancelled = true;
    };
  }, [needsCheck, profileId]);

  if (!needsCheck) return <>{children}</>;
  if (pinState?.profileId !== profileId) {
    return (
      <LockScreen>
        <SkeletonBlock className="h-16" />
      </LockScreen>
    );
  }
  return (
    <LockScreen>
      {pinState.hasPin ? (
        <EnterPin profileId={profileId} />
      ) : (
        <LockPinSetup
          title="এই ফোনে লক PIN নেই। নতুন ৪ সংখ্যার PIN দিন"
          onDone={(pin) => void setLockPin(profileId, pin).then(() => markUnlocked(profileId))}
        />
      )}
    </LockScreen>
  );
}
