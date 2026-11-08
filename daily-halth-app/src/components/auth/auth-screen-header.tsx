import { router } from 'expo-router';
import { ChevronLeft, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { BanglaText } from '@/components/ui/bangla-text';
import { IconBadge } from '@/components/ui/icon-badge';
import { colors } from '@/theme/design-tokens';

interface AuthScreenHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** Large icon above the title, telling what the step is about. */
  icon?: LucideIcon;
  /** Shown above the title (e.g. a StepIndicator). */
  eyebrow?: ReactNode;
  /** Show a back button (all auth steps except the welcome screen). */
  showBack?: boolean;
}

export function AuthScreenHeader({
  title,
  subtitle,
  icon,
  eyebrow,
  showBack = true,
}: AuthScreenHeaderProps) {
  return (
    <View className="mb-8">
      <View className="mb-6 min-h-touch flex-row items-center">
        {showBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="পেছনে যান"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))}
            hitSlop={8}
            className="h-11 w-11 items-center justify-center rounded-full border border-line bg-surface-card active:bg-primary-50">
            <ChevronLeft size={22} color={colors.ink} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>

      <View className="gap-3">
        {eyebrow}
        {icon ? (
          <View className="mb-1">
            <IconBadge icon={icon} size="lg" />
          </View>
        ) : null}
        <BanglaText variant="title" accessibilityRole="header">
          {title}
        </BanglaText>
        {typeof subtitle === 'string' ? (
          <BanglaText className="text-ink-muted">{subtitle}</BanglaText>
        ) : (
          subtitle
        )}
      </View>
    </View>
  );
}
