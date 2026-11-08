import Svg, { Path, Rect } from 'react-native-svg';

import { colors } from '@/theme/design-tokens';

interface BrandLogoProps {
  size?: number;
  /** `filled`: white heart on a teal tile (app icon look). `mark`: teal heart, no tile. */
  variant?: 'filled' | 'mark';
}

/** Heart with a pulse line: daily care at a glance. Same artwork as the app icon. */
export function BrandLogo({ size = 64, variant = 'filled' }: BrandLogoProps) {
  const filled = variant === 'filled';
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      accessibilityRole="image"
      accessibilityLabel="দৈনিক স্বাস্থ্য লোগো">
      {filled ? <Rect width={64} height={64} rx={18} fill={colors.primary} /> : null}
      <Path
        d="M32 51.5C19.6 43.1 11 35.3 11 25.6 11 19.2 15.9 14.5 21.9 14.5c4.1 0 7.7 2.1 10.1 5.5 2.4-3.4 6-5.5 10.1-5.5 6 0 10.9 4.7 10.9 11.1 0 9.7-8.6 17.5-21 25.9Z"
        fill={filled ? colors.white : colors.primary}
      />
      <Path
        d="M16.5 30h7.5l3.2-6.2 5 12.4 3.6-8.2 2.2 2h9.5"
        fill="none"
        stroke={filled ? colors.primary : colors.white}
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
