import { Check } from 'lucide-react-native';
import { Pressable, ScrollView, View } from 'react-native';

import { BanglaText } from './bangla-text';

import { colors } from '@/theme/design-tokens';

export interface ChipOption<T extends string | number> {
  value: T;
  label: string;
}

interface ChipSelectProps<T extends string | number> {
  options: ChipOption<T>[];
  value: T | null | undefined;
  onChange: (value: T) => void;
  label?: string;
  /** One horizontal line that scrolls (filters) instead of wrapping (forms). */
  scroll?: boolean;
  errorText?: string;
}

/** Pick one of a few options: big tappable chips instead of a dropdown. */
export function ChipSelect<T extends string | number>({
  options,
  value,
  onChange,
  label,
  scroll = false,
  errorText,
}: ChipSelectProps<T>) {
  const chips = options.map((option) => {
    const selected = option.value === value;
    return (
      <Pressable
        key={String(option.value)}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={option.label}
        onPress={() => onChange(option.value)}
        className={`min-h-touch flex-row items-center gap-1.5 rounded-full border-[1.5px] px-4 ${
          selected
            ? 'border-primary bg-primary'
            : 'border-line bg-surface-card active:bg-primary-50'
        }`}>
        {selected ? <Check size={15} color={colors.white} strokeWidth={2.5} /> : null}
        <BanglaText
          variant="label"
          className={selected ? 'font-bangla-semibold text-white' : 'text-ink'}>
          {option.label}
        </BanglaText>
      </Pressable>
    );
  });

  return (
    <View className="gap-2" accessibilityRole="radiogroup">
      {label ? <BanglaText variant="label">{label}</BanglaText> : null}
      {scroll ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 pr-5">
          {chips}
        </ScrollView>
      ) : (
        <View className="flex-row flex-wrap gap-2">{chips}</View>
      )}
      {errorText ? (
        <BanglaText variant="caption" className="text-danger">
          {errorText}
        </BanglaText>
      ) : null}
    </View>
  );
}
