/** Error codes of the notifications module. The app maps each to Bangla text; never rename. */
export const NotificationsErrorCode = {
  NOTIFICATION_NOT_FOUND: 'NOTIFICATION_NOT_FOUND',
} as const;

/** Why a delivery failed, stored in Notification.failureReason (never message content). */
export const DeliveryFailure = {
  /** The user has no logged-in phone with notification permission. */
  NO_PUSH_TOKEN: 'NO_PUSH_TOKEN',
  /** No verified phone number yet (SMS OTP is not launched). */
  NO_PHONE: 'NO_PHONE',
  SMS_PROVIDER_NOT_CONFIGURED: 'SMS_PROVIDER_NOT_CONFIGURED',
  PUSH_DISABLED: 'PUSH_DISABLED',
  SMS_DISABLED: 'SMS_DISABLED',
} as const;
