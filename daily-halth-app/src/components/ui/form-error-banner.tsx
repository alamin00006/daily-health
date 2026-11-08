import { CircleAlert, CircleCheck, Info, type LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { BanglaText } from './bangla-text';

import { colors, iconSize } from '@/theme/design-tokens';

type Tone = 'danger' | 'info' | 'success';

const TONE: Record<Tone, { box: string; text: string; icon: LucideIcon; color: string }> = {
  danger: {
    box: 'border-danger/20 bg-danger-soft',
    text: 'text-danger',
    icon: CircleAlert,
    color: colors.danger,
  },
  info: {
    box: 'border-primary-200 bg-primary-50',
    text: 'text-primary-700',
    icon: Info,
    color: colors.primary700,
  },
  success: {
    box: 'border-success/20 bg-success-soft',
    text: 'text-success',
    icon: CircleCheck,
    color: colors.success,
  },
};

interface InlineAlertProps {
  message: string;
  tone?: Tone;
}

/** A short message in a tinted box with an icon. */
export function InlineAlert({ message, tone = 'info' }: InlineAlertProps) {
  const style = TONE[tone];
  const Icon = style.icon;
  return (
    <View
      className={`flex-row items-start gap-3 rounded-2xl border px-4 py-3 ${style.box}`}
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      accessibilityLiveRegion={tone === 'danger' ? 'assertive' : 'polite'}>
      <View className="pt-[3px]">
        <Icon size={iconSize.md} color={style.color} strokeWidth={2} />
      </View>
      <BanglaText variant="label" className={`flex-1 font-bangla ${style.text}`}>
        {message}
      </BanglaText>
    </View>
  );
}

/** Error from the server (wrong PIN, network down…), shown above the submit button. */
export function FormErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return <InlineAlert message={message} tone="danger" />;
}
