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

  womensHealth: (profileId: string) => ['profile', profileId, 'womens-health'] as const,
  cycleOverview: (profileId: string) => ['profile', profileId, 'womens-health', 'overview'] as const,
  periods: (profileId: string) => ['profile', profileId, 'womens-health', 'periods'] as const,
  cycleLogs: (profileId: string, from: string, to: string) =>
    ['profile', profileId, 'womens-health', 'logs', from, to] as const,

  emergencyContacts: (profileId: string) => ['profile', profileId, 'emergency', 'contacts'] as const,
  emergencyActive: (profileId: string) => ['profile', profileId, 'emergency', 'active'] as const,
  emergencyHistory: (profileId: string) => ['profile', profileId, 'emergency', 'history'] as const,
  healthTips: (category: string) => ['health-tips', category] as const,
  healthTip: (tipId: string) => ['health-tip', tipId] as const,

  medicineSearch: (q: string) => ['medicine-search', q] as const,
  plans: (profileId: string) => ['profile', profileId, 'plans'] as const,
  plan: (profileId: string, planId: string) => ['profile', profileId, 'plan', planId] as const,
  doseDay: (profileId: string, date: string) => ['profile', profileId, 'doses', date] as const,
  doses: (profileId: string) => ['profile', profileId, 'doses'] as const,
  adherence: (profileId: string, days: number) =>
    ['profile', profileId, 'adherence', days] as const,

  specialties: (type: string) => ['specialties', type] as const,
  providerSearch: (filters: Record<string, unknown>) => ['providers', 'search', filters] as const,
  provider: (providerId: string) => ['providers', providerId] as const,
  availability: (providerId: string, mode: string, from: string) =>
    ['providers', providerId, 'availability', mode, from] as const,
  reviews: (providerId: string) => ['providers', providerId, 'reviews'] as const,
  favorites: (profileId: string) => ['profile', profileId, 'favorite-providers'] as const,
  appointments: (profileId: string, scope: string) =>
    ['profile', profileId, 'appointments', scope] as const,
  appointment: (profileId: string, appointmentId: string) =>
    ['profile', profileId, 'appointment', appointmentId] as const,
  followUps: (profileId: string, scope: string) =>
    ['profile', profileId, 'follow-ups', scope] as const,

  payments: (profileId: string) => ['profile', profileId, 'payments'] as const,
  payment: (paymentId: string) => ['payment', paymentId] as const,

  prescriptions: (profileId: string) => ['profile', profileId, 'prescriptions'] as const,
  prescription: (profileId: string, prescriptionId: string) =>
    ['profile', profileId, 'prescription', prescriptionId] as const,

  quickConsultOptions: ['quick-consults', 'options'] as const,
  consultations: (state: string) => ['consultations', state] as const,
  consultation: (consultationId: string) => ['consultation', consultationId] as const,
  conversation: (conversationId: string) => ['chat', conversationId, 'conversation'] as const,
  messages: (conversationId: string) => ['chat', conversationId, 'messages'] as const,

  inbox: ['notifications', 'inbox'] as const,
  unreadCount: ['notifications', 'unread'] as const,
  notificationPreferences: ['notifications', 'preferences'] as const,
};
