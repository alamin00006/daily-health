import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { BanglaText } from './bangla-text';
import { IconBadge } from './icon-badge';

import { colors } from '@/theme/design-tokens';

interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  iconTone?: 'primary' | 'danger' | 'success' | 'neutral';
  /** Replaces the icon (avatar, thumbnail). */
  leading?: ReactNode;
  /** Right side: a value, a pill, a switch. A chevron is shown when pressable and nothing is given. */
  trailing?: ReactNode;
  onPress?: () => void;
  /** Hairline under the row (inside a card). */
  divider?: boolean;
}

/** One row of a settings-like list or a card. At least 56px tall. */
export function ListRow({
  title,
  subtitle,
  icon,
  iconTone = 'primary',
  leading,
  trailing,
  onPress,
  divider = false,
}: ListRowProps) {
  const content = (
    <View
      className={`min-h-[56px] flex-row items-center gap-3.5 py-3 ${divider ? 'border-b border-line/60' : ''}`}>
      {leading ?? (icon ? <IconBadge icon={icon} tone={iconTone} size="sm" /> : null)}
      <View className="flex-1">
        <BanglaText variant="body-strong" numberOfLines={2}>
          {title}
        </BanglaText>
        {subtitle ? (
          <BanglaText variant="caption" numberOfLines={2}>
            {subtitle}
          </BanglaText>
        ) : null}
      </View>
      {trailing ??
        (onPress ? <ChevronRight size={20} color={colors.inkSubtle} strokeWidth={2} /> : null)}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      onPress={onPress}
      className="-mx-2 rounded-2xl px-2 active:bg-primary-50">
      {content}
    </Pressable>
  );
}

/** Title above a group of cards, with an optional link on the right. */
export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <BanglaText variant="heading">{title}</BanglaText>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          hitSlop={10}
          className="min-h-touch justify-center active:opacity-60">
          <BanglaText variant="label" className="font-bangla-semibold text-primary">
            {actionLabel}
          </BanglaText>
        </Pressable>
      ) : null}
    </View>
  );
}
