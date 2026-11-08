import { router } from 'expo-router';
import { ChevronLeft, X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { BanglaText } from './bangla-text';

import { toBanglaDigits } from '@/lib/bangla-digits';
import { colors } from '@/theme/design-tokens';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Buttons on the right (IconButton). */
  actions?: ReactNode;
  /** "close" for modal screens. */
  backIcon?: 'back' | 'close';
  /** Where to go when there is no screen to go back to. */
  fallbackHref?: string;
}

/** Title bar of inner screens: round back button, title, optional actions. */
export function ScreenHeader({
  title,
  subtitle,
  actions,
  backIcon = 'back',
  fallbackHref = '/',
}: ScreenHeaderProps) {
  const Icon = backIcon === 'close' ? X : ChevronLeft;
  return (
    <View className="flex-row items-center gap-3 px-4 pb-3 pt-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={backIcon === 'close' ? 'বন্ধ করুন' : 'পেছনে যান'}
        onPress={() => (router.canGoBack() ? router.back() : router.replace(fallbackHref as never))}
        hitSlop={8}
        className="h-11 w-11 items-center justify-center rounded-full border border-line bg-surface-card active:bg-primary-50">
        <Icon size={22} color={colors.ink} strokeWidth={2} />
      </Pressable>
      <View className="flex-1">
        <BanglaText variant="heading" numberOfLines={1} accessibilityRole="header">
          {title}
        </BanglaText>
        {subtitle ? (
          <BanglaText variant="caption" numberOfLines={1}>
            {subtitle}
          </BanglaText>
        ) : null}
      </View>
      {actions ? <View className="flex-row items-center gap-2">{actions}</View> : null}
    </View>
  );
}

interface IconButtonProps {
  icon: typeof X;
  label: string;
  onPress: () => void;
  tone?: 'default' | 'primary' | 'danger';
  /** Small dot or number on the corner (unread notifications). */
  badge?: number;
}

/** Round 44px icon button for headers. */
export function IconButton({
  icon: Icon,
  label,
  onPress,
  tone = 'default',
  badge,
}: IconButtonProps) {
  const color = tone === 'primary' ? colors.white : tone === 'danger' ? colors.danger : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      className={`h-11 w-11 items-center justify-center rounded-full ${
        tone === 'primary'
          ? 'bg-primary active:bg-primary-700'
          : 'border border-line bg-surface-card active:bg-primary-50'
      }`}>
      <Icon size={21} color={color} strokeWidth={2} />
      {badge ? (
        <View className="absolute -right-0.5 -top-0.5 min-w-[18px] items-center rounded-full border-2 border-surface bg-danger px-1">
          <BanglaText className="font-bangla-semibold text-[10px] leading-[14px] text-white">
            {badge > 9 ? '৯+' : toBanglaDigits(badge)}
          </BanglaText>
        </View>
      ) : null}
    </Pressable>
  );
}
