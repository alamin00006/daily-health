import { Stack } from 'expo-router';

/** Screens for logged-out users: welcome, login, email code, PIN. */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: '#f4f9f7' },
      }}
    />
  );
}
