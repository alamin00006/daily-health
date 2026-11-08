import { Stack } from 'expo-router';

import { useAppServices } from '@/features/app/use-app-services';
import { colors } from '@/theme/design-tokens';

/** Screens for logged-in users (and guests): the tabs plus the screens opened from them. */
export default function SignedInLayout() {
  useAppServices();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.surface },
      }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="profile-switcher"
        options={{
          presentation: 'transparentModal',
          animation: 'fade',
          // The tab underneath stays visible behind the dimmed backdrop.
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
    </Stack>
  );
}
