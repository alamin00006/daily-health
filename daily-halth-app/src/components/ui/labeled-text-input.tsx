import type { LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { BanglaText } from './bangla-text';

import { colors, iconSize } from '@/theme/design-tokens';

interface LabeledTextInputProps extends TextInputProps {
  label: string;
  /** Icon inside the field, before the text. */
  icon?: LucideIcon;
  /** Grey hint under the field (hidden while there is an error). */
  helperText?: string;
  /** Shown under the field in red. */
  errorText?: string | null;
}

/** Text field with label, optional leading icon, focus state, helper and error text. */
export function LabeledTextInput({
  label,
  icon: Icon,
  helperText,
  errorText,
  onFocus,
  onBlur,
  ...inputProps
}: LabeledTextInputProps) {
  const [focused, setFocused] = useState(false);
  const borderClass = errorText
    ? 'border-danger bg-danger-soft/40'
    : focused
      ? 'border-primary bg-surface-card'
      : 'border-line bg-surface-card';
  const iconColor = errorText ? colors.danger : focused ? colors.primary : colors.inkSubtle;

  return (
    <View className="gap-2">
      <BanglaText variant="label">{label}</BanglaText>
      <View
        className={`min-h-[52px] flex-row items-center gap-3 rounded-2xl border-[1.5px] px-4 ${borderClass}`}>
        {Icon ? <Icon size={iconSize.md} color={iconColor} strokeWidth={1.8} /> : null}
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.inkSubtle}
          className="flex-1 py-3 font-bangla text-[16px] text-ink"
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          {...inputProps}
        />
      </View>
      {errorText ? (
        <BanglaText variant="caption" className="text-danger" accessibilityLiveRegion="polite">
          {errorText}
        </BanglaText>
      ) : helperText ? (
        <BanglaText variant="caption">{helperText}</BanglaText>
      ) : null}
    </View>
  );
}
