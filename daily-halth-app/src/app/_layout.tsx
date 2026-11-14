import '../../global.css';

import { BalooDa2_700Bold } from '@expo-google-fonts/baloo-da-2';
import {
  HindSiliguri_400Regular,
  HindSiliguri_500Medium,
  HindSiliguri_600SemiBold,
  HindSiliguri_700Bold,
  useFonts,
} from '@expo-google-fonts/hind-siliguri';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient } from '@/lib/query-client';
import { useSessionStore } from '@/stores/session-store';
import { ThemeRoot } from '@/theme/runtime-theme';

// Keep the splash up until fonts are loaded and the saved session is read.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    HindSiliguri_400Regular,
    HindSiliguri_500Medium,
    HindSiliguri_600SemiBold,
    HindSiliguri_700Bold,
    BalooDa2_700Bold,
  });
  const status = useSessionStore((s) => s.status);
  const restore = useSessionStore((s) => s.restore);
  const isGuest = useSessionStore((s) => s.user?.isGuest ?? false);

  useEffect(() => {
    void restore();
  }, [restore]);

  // A font that fails to load falls back to the system font rather than blocking the app.
  const ready = (fontsLoaded || fontError !== null) && status !== 'restoring';

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  const signedIn = status === 'signedIn';
  // Guests browse the app and can open login/signup on top of it; a real login
  // ends the guest session and closes these screens.
  const canSeeAuth = !signedIn || isGuest;
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeRoot>
        <SafeAreaProvider>
          <Stack
            screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#f4f9f7' } }}>
            {/* Changing `signedIn` moves the user to the right group automatically. */}
            <Stack.Protected guard={signedIn}>
              <Stack.Screen name="(app)" />
            </Stack.Protected>
            <Stack.Protected guard={canSeeAuth}>
              <Stack.Screen name="(auth)" />
            </Stack.Protected>
          </Stack>
          <StatusBar style="dark" />
        </SafeAreaProvider>
      </ThemeRoot>
    </QueryClientProvider>
  );
}
