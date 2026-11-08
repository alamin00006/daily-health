import { Redirect } from 'expo-router';

import { useSessionStore } from '@/stores/session-store';

/** Entry route "/" (the name `index` is required by Expo Router): send to home or welcome. */
export default function EntryRedirect() {
  const signedIn = useSessionStore((s) => s.status === 'signedIn');
  return <Redirect href={signedIn ? '/home' : '/welcome'} />;
}
