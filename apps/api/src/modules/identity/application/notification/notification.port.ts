/**
 * Provider-agnostic notification boundary.
 *
 * HC-DEC-014 (notification/email delivery) remains open, so this milestone ships only non-production
 * transports. Recovery material is handed to a transport and is never written to a log.
 */

export type SecurityNotificationKind = 'PASSWORD_RESET';

export interface SecurityNotification {
  readonly kind: SecurityNotificationKind;
  readonly recipient: string;
  readonly subject: string;
  /** Contains the single-use recovery token; must never be logged or returned to a caller. */
  readonly body: string;
  readonly expiresAt: Date;
}

export interface NotificationDeliveryResult {
  readonly delivered: boolean;
  readonly transport: string;
}

export const NOTIFICATION_PORT = Symbol('NOTIFICATION_PORT');

export interface NotificationPort {
  deliver(notification: SecurityNotification): Promise<NotificationDeliveryResult>;
}
