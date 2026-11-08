import { View } from 'react-native';

import { BanglaText } from './bangla-text';

export type PillTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary';

const TONES: Record<PillTone, { box: string; text: string; dot: string }> = {
  success: { box: 'bg-success-soft', text: 'text-success', dot: 'bg-success' },
  warning: { box: 'bg-warning-soft', text: 'text-warning', dot: 'bg-warning' },
  danger: { box: 'bg-danger-soft', text: 'text-danger', dot: 'bg-danger' },
  info: { box: 'bg-primary-50', text: 'text-primary-700', dot: 'bg-primary' },
  primary: { box: 'bg-primary', text: 'text-white', dot: 'bg-white' },
  neutral: { box: 'bg-line/60', text: 'text-ink-muted', dot: 'bg-ink-subtle' },
};

/** Small rounded label with a dot: "স্বাভাবিক", "নেওয়া হয়েছে", "মালিক". */
export function StatusPill({ label, tone = 'neutral' }: { label: string; tone?: PillTone }) {
  const style = TONES[tone];
  return (
    <View
      className={`flex-row items-center gap-1.5 self-start rounded-full px-2.5 py-1 ${style.box}`}>
      <View className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      <BanglaText className={`font-bangla-semibold text-[12px] leading-[18px] ${style.text}`}>
        {label}
      </BanglaText>
    </View>
  );
}
