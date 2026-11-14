import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Lightbulb } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { BanglaText } from '@/components/ui/bangla-text';
import { TIP_CATEGORY_LABELS } from '@/features/content/tip-display';
import { providerTitle } from '@/features/doctors/doctor-display';
import type { HealthTipResponse } from '@/shared-contracts/content.contract';
import { colors } from '@/theme/design-tokens';

/** A tip in a list or the home strip; opens the full tip. */
export function HealthTipCard({ tip, compact = false }: { tip: HealthTipResponse; compact?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tip.title}
      onPress={() => router.push({ pathname: '/tips/[tipId]', params: { tipId: tip.id } })}
      className={`overflow-hidden rounded-3xl border border-line/70 bg-surface-card active:bg-primary-50 ${
        compact ? 'w-[240px]' : ''
      }`}>
      {tip.imageThumbnailUrl ? (
        <Image
          source={tip.imageThumbnailUrl}
          style={{ width: '100%', height: compact ? 110 : 150 }}
          contentFit="cover"
          transition={150}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View className={`items-center justify-center bg-primary-50 ${compact ? 'h-[72px]' : 'h-[88px]'}`}>
          <Lightbulb size={28} color={colors.primary} />
        </View>
      )}
      <View className="gap-1 p-4">
        <BanglaText variant="caption" className="text-primary">
          {TIP_CATEGORY_LABELS[tip.category]}
        </BanglaText>
        <BanglaText variant="body-strong" numberOfLines={2}>
          {tip.title}
        </BanglaText>
        {!compact ? (
          <BanglaText variant="caption" numberOfLines={2}>
            {tip.body}
          </BanglaText>
        ) : null}
        {tip.author ? (
          <BanglaText variant="caption" numberOfLines={1}>
            লিখেছেন: {providerTitle(tip.author.type, tip.author.displayName)}
          </BanglaText>
        ) : null}
      </View>
    </Pressable>
  );
}
