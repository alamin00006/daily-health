import { Switch, View } from 'react-native';

import { BanglaText } from './bangla-text';

import { colors } from '@/theme/design-tokens';

interface SwitchRowProps {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  divider?: boolean;
}

/** A setting that is on or off. The whole row is the label of the switch. */
export function SwitchRow({
  title,
  subtitle,
  value,
  onChange,
  disabled = false,
  divider = false,
}: SwitchRowProps) {
  return (
    <View
      className={`min-h-[60px] flex-row items-center gap-3 py-3 ${divider ? 'border-b border-line/60' : ''}`}>
      <View className="flex-1">
        <BanglaText variant="body-strong">{title}</BanglaText>
        {subtitle ? <BanglaText variant="caption">{subtitle}</BanglaText> : null}
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: colors.line, true: colors.primary300 }}
        thumbColor={value ? colors.primary : colors.card}
      />
    </View>
  );
}
