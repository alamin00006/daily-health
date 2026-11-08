import { Pressable } from 'react-native';

import { BanglaText, type TextVariant } from './bangla-text';

interface TextLinkProps {
  label: string;
  onPress: () => void;
  variant?: TextVariant;
  tone?: 'primary' | 'muted';
}

/**
 * A tappable word or phrase inside running text ("পিন ভুলে গেছেন?").
 * The hit area is padded to 44px tall even though the text is small.
 */
export function TextLink({ label, onPress, variant = 'label', tone = 'primary' }: TextLinkProps) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
      className="min-h-touch justify-center active:opacity-60">
      <BanglaText
        variant={variant}
        className={`font-bangla-semibold ${tone === 'primary' ? 'text-primary' : 'text-ink-muted'}`}>
        {label}
      </BanglaText>
    </Pressable>
  );
}
