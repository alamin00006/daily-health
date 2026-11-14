import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { colors } from '@/theme/design-tokens';

type Tone = 'primary' | 'danger' | 'success' | 'neutral' | 'rose';

const TONE: Record<Tone, { box: string; color: string }> = {
  primary: { box: 'bg-primary-100', color: colors.primary },
  danger: { box: 'bg-danger-soft', color: colors.danger },
  success: { box: 'bg-success-soft', color: colors.success },
  neutral: { box: 'bg-surface', color: colors.inkMuted },
  rose: { box: 'bg-rose-soft', color: colors.rose },
};

const SIZE = {
  sm: { box: 'h-10 w-10 rounded-xl', icon: 20 },
  md: { box: 'h-12 w-12 rounded-2xl', icon: 24 },
  lg: { box: 'h-16 w-16 rounded-[22px]', icon: 30 },
} as const;

interface IconBadgeProps {
  icon: LucideIcon;
  tone?: Tone;
  size?: keyof typeof SIZE;
}

/** An icon on a soft tinted tile: list rows, screen headers, empty states. */
export function IconBadge({ icon: Icon, tone = 'primary', size = 'md' }: IconBadgeProps) {
  return (
    <View className={`items-center justify-center ${SIZE[size].box} ${TONE[tone].box}`}>
      <Icon size={SIZE[size].icon} color={TONE[tone].color} strokeWidth={1.9} />
    </View>
  );
}
