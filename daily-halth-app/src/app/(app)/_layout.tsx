import { Stack } from 'expo-router';

import { useAppServices } from '@/features/app/use-app-services';
import { GuestGate } from '@/features/auth/guest-access';
import { colors } from '@/theme/design-tokens';

/** Screens for logged-in users (and guests): the tabs plus the screens opened from them. */
export default function SignedInLayout() {
  useAppServices();
  return (
    <Stack
      // Guests browse; a screen that needs an account opens login instead (guest-access.tsx).
      screenLayout={({ route, children }) => <GuestGate routeName={route.name}>{children}</GuestGate>}
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.surface },
      }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="consultations/[consultationId]/call"
        options={{ presentation: 'fullScreenModal', animation: 'fade', contentStyle: { backgroundColor: colors.ink } }}
      />
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
