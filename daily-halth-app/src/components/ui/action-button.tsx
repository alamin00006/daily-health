import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { BanglaText } from './bangla-text';

import { colors, iconSize, shadows } from '@/theme/design-tokens';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

const CONTAINER: Record<Variant, string> = {
  primary: 'bg-primary active:bg-primary-700',
  secondary: 'bg-primary-100 active:bg-primary-200',
  outline: 'border border-line-strong bg-surface-card active:bg-primary-50',
  ghost: 'bg-transparent active:bg-primary-50',
  danger: 'border border-danger/25 bg-danger-soft active:opacity-80',
};

const LABEL: Record<Variant, string> = {
  primary: 'text-white',
  secondary: 'text-primary-700',
  outline: 'text-ink',
  ghost: 'text-primary',
  danger: 'text-danger',
};

const ICON_COLOR: Record<Variant, string> = {
  primary: colors.white,
  secondary: colors.primary700,
  outline: colors.ink,
  ghost: colors.primary,
  danger: colors.danger,
};

const SIZE: Record<Size, string> = {
  md: 'min-h-[52px] rounded-2xl px-5',
  sm: 'min-h-touch rounded-xl px-4',
};

interface ActionButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  /** Icon before the label. */
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  /** Full width (default) or as wide as its content. */
  fullWidth?: boolean;
}

/** Buttons. Every size stays at least 44px tall (touch target, CLAUDE.md §7). */
export function ActionButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading = false,
  disabled = false,
  fullWidth = true,
}: ActionButtonProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={variant === 'primary' && !inactive ? shadows.button : undefined}
      className={`flex-row items-center justify-center ${SIZE[size]} ${CONTAINER[variant]} ${
        fullWidth ? 'self-stretch' : 'self-start'
      } ${inactive ? 'opacity-50' : ''}`}>
      {loading ? (
        <ActivityIndicator color={ICON_COLOR[variant]} />
      ) : (
        // Margin, not `gap`: in a content-sized row Yoga leaves the gap out when
        // measuring the label on Android, which pushes its last word onto a hidden line.
        <View className="flex-row items-center">
          {Icon ? (
            <View className="mr-2">
              <Icon size={iconSize.md} color={ICON_COLOR[variant]} strokeWidth={2} />
            </View>
          ) : null}
          <BanglaText
            variant={size === 'md' ? 'body-strong' : 'label'}
            className={`${LABEL[variant]} ${size === 'sm' ? 'font-bangla-semibold' : ''}`}>
            {label}
          </BanglaText>
        </View>
      )}
    </Pressable>
  );
}
