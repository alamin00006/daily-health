import type { ReactNode } from 'react';
import { View } from 'react-native';

import { shadows } from '@/theme/design-tokens';

interface SurfaceCardProps {
  children: ReactNode;
  className?: string;
  /** No padding, for lists whose rows bring their own. */
  flush?: boolean;
}

/** White card with a hairline border and a soft shadow. */
export function SurfaceCard({ children, className = '', flush = false }: SurfaceCardProps) {
  return (
    <View
      style={shadows.card}
      className={`rounded-3xl border border-line/70 bg-surface-card ${flush ? '' : 'p-5'} ${className}`}>
      {children}
    </View>
  );
}
