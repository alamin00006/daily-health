import { View } from 'react-native';

import { BanglaText } from './bangla-text';

import { toBanglaDigits } from '@/lib/bangla-digits';

interface StepIndicatorProps {
  /** 1-based. */
  current: number;
  total: number;
}

/** "ধাপ ২/৩" with a segmented bar, for multi-step flows. */
export function StepIndicator({ current, total }: StepIndicatorProps) {
  return (
    <View
      className="gap-2"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: total, now: current }}>
      <BanglaText variant="caption" className="font-bangla-medium text-primary">
        ধাপ {toBanglaDigits(current)}/{toBanglaDigits(total)}
      </BanglaText>
      <View className="flex-row gap-1.5">
        {Array.from({ length: total }, (_, index) => (
          <View
            key={index}
            className={`h-1.5 flex-1 rounded-full ${index < current ? 'bg-primary' : 'bg-line'}`}
          />
        ))}
      </View>
    </View>
  );
}
