/**
 * TanStack Query keys in one place, so mutations invalidate exactly what they
 * changed. Everything about one profile starts with ['profile', profileId].
 */
export const queryKeys = {
  me: ['me'] as const,
  profiles: ['profiles'] as const,
  profile: (profileId: string) => ['profile', profileId] as const,
  members: (profileId: string) => ['profile', profileId, 'members'] as const,
  invites: (profileId: string) => ['profile', profileId, 'invites'] as const,
  myInvites: ['my-invites'] as const,

  latestVitals: (profileId: string) => ['profile', profileId, 'vitals', 'latest'] as const,
  vitals: (profileId: string, type?: string) =>
    ['profile', profileId, 'vitals', 'list', type ?? 'ALL'] as const,
  conditions: (profileId: string) => ['profile', profileId, 'conditions'] as const,
  healthCard: (profileId: string) => ['profile', profileId, 'health-card'] as const,
  healthCardAccesses: (profileId: string) =>
    ['profile', profileId, 'health-card', 'accesses'] as const,

  files: (profileId: string, type?: string) =>
    ['profile', profileId, 'files', type ?? 'ALL'] as const,
  file: (profileId: string, fileId: string) => ['profile', profileId, 'file', fileId] as const,

  medicineSearch: (q: string) => ['medicine-search', q] as const,
  plans: (profileId: string) => ['profile', profileId, 'plans'] as const,
  plan: (profileId: string, planId: string) => ['profile', profileId, 'plan', planId] as const,
  doseDay: (profileId: string, date: string) => ['profile', profileId, 'doses', date] as const,
  doses: (profileId: string) => ['profile', profileId, 'doses'] as const,
  adherence: (profileId: string, days: number) =>
    ['profile', profileId, 'adherence', days] as const,

  inbox: ['notifications', 'inbox'] as const,
  unreadCount: ['notifications', 'unread'] as const,
  notificationPreferences: ['notifications', 'preferences'] as const,
};
