import { focusManager, QueryClient } from '@tanstack/react-query';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { isApiError } from '@/api/api-error';

/**
 * Server state (TanStack Query). Tuned for slow, flaky mobile networks
 * (CLAUDE.md §8): retry only connectivity failures, never 4xx answers.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 24 * 60 * 60_000,
      retry: (failureCount, error) =>
        failureCount < 3 &&
        isApiError(error) &&
        (error.isConnectivityProblem || error.status >= 500),
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000),
    },
    mutations: {
      // OTP sends, logins and signups must not be repeated behind the user's back.
      retry: false,
    },
  },
});

/** Refetch stale queries when the app comes back to the foreground. */
AppState.addEventListener('change', (status: AppStateStatus) => {
  if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
});
