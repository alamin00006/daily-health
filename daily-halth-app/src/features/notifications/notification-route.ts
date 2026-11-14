import type { Href } from 'expo-router';

/** Deep-link data the API puts on pushes and inbox items (`data.screen`). */
export interface NotificationLink {
  screen?: string;
  profileId?: string;
  appointmentId?: string;
  followUpId?: string;
  paymentId?: string;
  consultationId?: string;
  prescriptionId?: string;
  orderId?: string;
  postId?: string;
  /** "1" on a ringing call push. */
  incomingCall?: string;
}

/** Where a tapped notification leads; null = stay (the inbox). */
export function notificationHref(data: NotificationLink | null | undefined): Href | null {
  switch (data?.screen) {
    case 'medicine':
      return '/medicine';
    case 'appointment':
      return data.appointmentId
        ? { pathname: '/appointments/[appointmentId]', params: { appointmentId: data.appointmentId } }
        : '/appointments';
    case 'follow-up':
      return '/appointments';
    case 'payments':
      return data.paymentId
        ? { pathname: '/payments/[paymentId]', params: { paymentId: data.paymentId } }
        : '/payments';
    case 'prescription':
      return data.prescriptionId
        ? { pathname: '/prescriptions/[prescriptionId]', params: { prescriptionId: data.prescriptionId } }
        : '/prescriptions';
    case 'consultation':
      if (!data.consultationId) return '/consultations';
      return data.incomingCall === '1'
        ? {
            pathname: '/consultations/[consultationId]/call',
            params: { consultationId: data.consultationId, incoming: '1' },
          }
        : { pathname: '/consultations/[consultationId]', params: { consultationId: data.consultationId } };
    case 'emergency':
      return '/emergency';
    case 'womens-health':
      return '/womens-health';
    case 'community-post':
      return data.postId ? { pathname: '/community/[postId]', params: { postId: data.postId } } : '/community';
    case 'community-women':
      return { pathname: '/community', params: { space: 'WOMEN' } };
    case 'diet':
      return '/diet';
    case 'shop-order':
      return data.orderId
        ? { pathname: '/shop/orders/[orderId]', params: { orderId: data.orderId } }
        : '/shop/orders';
    default:
      return null;
  }
}
