import { CloudOff, RotateCw, type LucideIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Animated, View } from 'react-native';

import { ActionButton } from './action-button';
import { BanglaText } from './bangla-text';
import { IconBadge } from './icon-badge';

import { apiErrorMessage } from '@/api/api-error-messages';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Nothing here yet: says what this place is for and how to start. */
export function EmptyState({ icon, title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View className="items-center gap-3 rounded-3xl border border-dashed border-line-strong bg-surface-card/60 px-6 py-8">
      <IconBadge icon={icon} size="lg" />
      <BanglaText variant="body-strong" className="text-center">
        {title}
      </BanglaText>
      {message ? (
        <BanglaText variant="caption" className="text-center">
          {message}
        </BanglaText>
      ) : null}
      {actionLabel && onAction ? (
        <View className="mt-1 self-stretch">
          <ActionButton label={actionLabel} onPress={onAction} variant="secondary" size="sm" />
        </View>
      ) : null}
    </View>
  );
}

/** A failed load, with the Bangla reason and a retry button. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <View className="items-center gap-3 rounded-3xl bg-danger-soft/60 px-6 py-7">
      <IconBadge icon={CloudOff} tone="danger" size="lg" />
      <BanglaText variant="label" className="text-center font-bangla text-ink">
        {apiErrorMessage(error)}
      </BanglaText>
      <ActionButton
        label="আবার চেষ্টা করুন"
        icon={RotateCw}
        variant="outline"
        size="sm"
        fullWidth={false}
        onPress={onRetry}
      />
    </View>
  );
}

/** Pulsing placeholder blocks while a list loads (feels faster than a spinner on slow networks). */
export function SkeletonBlock({ className = 'h-20' }: { className?: string }) {
  const [opacity] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={{ opacity }}
      className={`rounded-3xl bg-line/60 ${className}`}
      accessibilityLabel="লোড হচ্ছে"
    />
  );
}

export function LoadingList({
  rows = 3,
  rowClassName = 'h-20',
}: {
  rows?: number;
  rowClassName?: string;
}) {
  return (
    <View className="gap-3">
      {Array.from({ length: rows }, (_, index) => (
        <SkeletonBlock key={index} className={rowClassName} />
      ))}
    </View>
  );
}
