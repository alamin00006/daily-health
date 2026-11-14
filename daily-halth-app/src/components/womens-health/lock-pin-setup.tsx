import { useState } from 'react';
import { Keyboard, View } from 'react-native';

import { BanglaText } from '@/components/ui/bangla-text';
import { DigitCodeInput } from '@/components/ui/digit-code-input';
import { LOCK_PIN_LENGTH } from '@/features/womens-health/womens-health-lock';

/** Type a new 4-digit lock PIN twice. */
export function LockPinSetup({ onDone, title }: { onDone: (pin: string) => void; title: string }) {
  const [first, setFirst] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [mismatch, setMismatch] = useState(false);

  const complete = (pin: string) => {
    if (first === null) {
      setFirst(pin);
      setValue('');
      return;
    }
    if (pin === first) {
      Keyboard.dismiss();
      onDone(pin);
      return;
    }
    setMismatch(true);
    setFirst(null);
    setValue('');
  };

  return (
    <View className="gap-3">
      <BanglaText variant="body-strong">{first === null ? title : 'আবার একই PIN দিন'}</BanglaText>
      <View className="self-center" style={{ width: 4 * 64 }}>
        <DigitCodeInput
          key={first === null ? 'first' : 'confirm'}
          value={value}
          onChange={(v) => {
            setMismatch(false);
            setValue(v);
          }}
          onComplete={complete}
          length={LOCK_PIN_LENGTH}
          masked
          autoFocus
          kind="pin"
          hasError={mismatch}
          accessibilityLabel="লক PIN"
        />
      </View>
      <BanglaText variant="caption" className={mismatch ? 'text-danger' : undefined}>
        {mismatch
          ? 'দুইবার একই PIN হয়নি। আবার শুরু করুন।'
          : 'এই PIN শুধু এই ফোনে থাকে, আমাদের সার্ভারে যায় না। লগইনের PIN থেকে আলাদা রাখুন।'}
      </BanglaText>
    </View>
  );
}
