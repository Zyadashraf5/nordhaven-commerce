import path from 'node:path';
import type { EnvironmentConfiguration } from '../../../../platform/config/environment';
import { FileNotificationTransport } from './file-notification.transport';
import { MemoryNotificationTransport } from './memory-notification.transport';
import type { NotificationDeliveryResult, NotificationPort } from './notification.port';

/** Selected when no channel is configured: the flow succeeds but no recovery material is delivered. */
export class NoopNotificationTransport implements NotificationPort {
  // The notification is intentionally discarded; this transport reports that nothing was sent.
  public deliver(): Promise<NotificationDeliveryResult> {
    return Promise.resolve({ delivered: false, transport: 'none' });
  }
}

export function createNotificationTransport(
  configuration: EnvironmentConfiguration,
): NotificationPort {
  switch (configuration.authNotificationTransport) {
    case 'memory':
      return new MemoryNotificationTransport();
    case 'file':
      return new FileNotificationTransport(path.join(process.cwd(), 'tmp', 'notifications'));
    default:
      return new NoopNotificationTransport();
  }
}
