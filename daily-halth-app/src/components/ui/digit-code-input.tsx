import { useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { BanglaText } from './bangla-text';

import { toAsciiDigits, toBanglaDigits } from '@/lib/bangla-digits';

interface DigitCodeInputProps {
  /** ASCII digits only. */
  value: string;
  onChange: (value: string) => void;
  length?: number;
  /** Show dots instead of digits (PINs). */
  masked?: boolean;
  /** Called once all digits are entered. */
  onComplete?: (value: string) => void;
  accessibilityLabel: string;
  hasError?: boolean;
  autoFocus?: boolean;
  /** OTP codes from email can be pasted / autofilled; PINs cannot. */
  kind: 'one-time-code' | 'pin';
}

/**
 * Six boxes over one hidden TextInput. Accepts Bangla digits from a Bangla
 * keyboard and converts them; shows Bangla numerals. Filled boxes are tinted,
 * the next box to type into is outlined with a caret.
 */
export function DigitCodeInput({
  value,
  onChange,
  length = 6,
  masked = false,
  onComplete,
  accessibilityLabel,
  hasError = false,
  autoFocus = false,
  kind,
}: DigitCodeInputProps) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(autoFocus);

  const handleChange = (text: string) => {
    const digits = toAsciiDigits(text).replace(/\D/g, '').slice(0, length);
    onChange(digits);
    if (digits.length === length) onComplete?.(digits);
  };

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      accessibilityLabel={accessibilityLabel}
      className="flex-row justify-between gap-2.5">
      {Array.from({ length }, (_, index) => {
        const char = value[index];
        const isNext = focused && index === value.length;
        const boxClass = hasError
          ? 'border-danger bg-danger-soft'
          : isNext
            ? 'border-primary bg-surface-card'
            : char
              ? 'border-primary-200 bg-primary-50'
              : 'border-line bg-surface-card';
        return (
          <View
            key={index}
            className={`h-[58px] flex-1 items-center justify-center rounded-2xl border-[1.5px] ${boxClass}`}>
            {char ? (
              masked ? (
                <View className="h-3 w-3 rounded-full bg-ink" />
              ) : (
                <BanglaText className="font-bangla-semibold text-[24px] leading-[32px]">
                  {toBanglaDigits(char)}
                </BanglaText>
              )
            ) : isNext ? (
              <View className="h-6 w-[2px] rounded-full bg-primary" />
            ) : null}
          </View>
        );
      })}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        maxLength={length}
        keyboardType="number-pad"
        autoFocus={autoFocus}
        secureTextEntry={masked}
        textContentType={kind === 'one-time-code' ? 'oneTimeCode' : 'password'}
        autoComplete={kind === 'one-time-code' ? 'one-time-code' : 'off'}
        accessibilityLabel={accessibilityLabel}
        caretHidden
        // Invisible but focusable: the boxes above are what the user sees.
        className="absolute h-full w-full opacity-0"
      />
    </Pressable>
  );
}
