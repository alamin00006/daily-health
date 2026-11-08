import { buildQuery } from './query-string';
import { apiRequest } from './http-client';

import type { PaginatedResponse } from '@/shared-contracts/common-fields.contract';
import type {
  NotificationPreferencesResponse,
  NotificationResponse,
  UnreadCountResponse,
  UpdateNotificationPreferencesRequest,
} from '@/shared-contracts/notifications.contract';

const auth = { authenticated: true } as const;

/** In-app inbox, notification settings and this phone's push token. */
export const notificationsEndpoints = {
  inbox: (cursor?: string) =>
    apiRequest<PaginatedResponse<NotificationResponse>>(
      `/me/notifications${buildQuery({ cursor, limit: 20 })}`,
      auth
    ),
  unreadCount: () => apiRequest<UnreadCountResponse>('/me/notifications/unread-count', auth),
  markRead: (notificationId: string) =>
    apiRequest<void>(`/me/notifications/${notificationId}/read`, { ...auth, method: 'POST' }),
  markAllRead: () => apiRequest<void>('/me/notifications/read-all', { ...auth, method: 'POST' }),

  preferences: () =>
    apiRequest<NotificationPreferencesResponse>('/me/notification-preferences', auth),
  updatePreferences: (body: UpdateNotificationPreferencesRequest) =>
    apiRequest<NotificationPreferencesResponse>('/me/notification-preferences', {
      ...auth,
      method: 'PATCH',
      body,
    }),

  /** null when permission was taken away. */
  updatePushToken: (pushToken: string | null) =>
    apiRequest<void>('/auth/device/push-token', {
      ...auth,
      method: 'PUT',
      body: { pushToken },
    }),
};
