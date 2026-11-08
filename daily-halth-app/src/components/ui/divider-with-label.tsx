import { View } from 'react-native';

import { BanglaText } from './bangla-text';

/** ──── অথবা ──── between two alternative actions. */
export function DividerWithLabel({ label }: { label: string }) {
  return (
    <View className="flex-row items-center gap-3" accessible={false}>
      <View className="h-px flex-1 bg-line" />
      <BanglaText variant="caption" className="text-ink-subtle">
        {label}
      </BanglaText>
      <View className="h-px flex-1 bg-line" />
    </View>
  );
}
