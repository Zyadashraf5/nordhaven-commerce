import type {
  NotificationDeliveryResult,
  NotificationPort,
  SecurityNotification,
} from './notification.port';

/**
 * Test transport: captures notifications in memory so suites can complete a recovery flow without
 * any external channel. Never selected outside a test configuration.
 */
export class MemoryNotificationTransport implements NotificationPort {
  private readonly notifications: SecurityNotification[] = [];

  public deliver(notification: SecurityNotification): Promise<NotificationDeliveryResult> {
    this.notifications.push(notification);
    return Promise.resolve({ delivered: true, transport: 'memory' });
  }

  public get delivered(): readonly SecurityNotification[] {
    return this.notifications;
  }

  public clear(): void {
    this.notifications.length = 0;
  }
}
