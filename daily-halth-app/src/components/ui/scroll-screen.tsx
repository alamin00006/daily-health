import { useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/theme/design-tokens';

interface ScrollScreenProps {
  children: ReactNode;
  /** Fixed above the scrolling content (ScreenHeader). */
  header?: ReactNode;
  /** Fixed under it (main action). */
  footer?: ReactNode;
  /** Pull to refresh. */
  onRefresh?: () => Promise<unknown>;
  /** Tab screens: the tab bar already covers the bottom inset. */
  inTabs?: boolean;
}

/** Full screen for reading: safe area, header, pull to refresh, optional footer. */
export function ScrollScreen({
  children,
  header,
  footer,
  onRefresh,
  inTabs = false,
}: ScrollScreenProps) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = onRefresh
    ? async () => {
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }
    : undefined;

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={inTabs ? ['top'] : ['top', 'bottom']}>
      {header}
      <ScrollView
        contentContainerClassName="flex-grow gap-5 px-5 pb-10 pt-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          refresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refresh()}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          ) : undefined
        }>
        {children}
      </ScrollView>
      {footer ? (
        <View className="gap-3 border-t border-line/60 bg-surface px-5 pb-4 pt-3">{footer}</View>
      ) : null}
    </SafeAreaView>
  );
}
