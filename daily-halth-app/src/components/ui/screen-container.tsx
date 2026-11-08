import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ScreenContainerProps {
  children: ReactNode;
  /** Fixed above the form (ScreenHeader). */
  header?: ReactNode;
  /** Pinned under the scrolling content (main actions), above the keyboard. */
  footer?: ReactNode;
}

/**
 * Full-screen wrapper for forms: safe area, scrolls on small phones, and moves
 * up with the keyboard so the main button stays reachable.
 */
export function ScreenContainer({ children, header, footer }: ScreenContainerProps) {
  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
      {header}
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerClassName={`flex-grow pb-6 ${header ? 'gap-5 px-5 pt-1' : 'px-6 pt-2'}`}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
        {footer ? <View className="gap-3 px-5 pb-4 pt-2">{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
