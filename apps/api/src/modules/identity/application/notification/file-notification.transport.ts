import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Logger } from '@nestjs/common';
import type {
  NotificationDeliveryResult,
  NotificationPort,
  SecurityNotification,
} from './notification.port';

/**
 * Development transport: writes the delivery artifact under an ignored working directory so a
 * developer can complete a recovery flow without a real channel.
 *
 * This transport refuses to construct in production, so the development convenience can never become
 * a production delivery path. Only the artifact path is logged; the token is never logged.
 */
export class FileNotificationTransport implements NotificationPort {
  private readonly logger = new Logger(FileNotificationTransport.name);

  public constructor(private readonly directory: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('The file notification transport is not permitted in production');
    }
  }

  public async deliver(notification: SecurityNotification): Promise<NotificationDeliveryResult> {
    await mkdir(this.directory, { recursive: true });
    const target = path.join(
      this.directory,
      `${Date.now()}-${notification.kind.toLowerCase()}.json`,
    );
    await writeFile(
      target,
      `${JSON.stringify(
        {
          kind: notification.kind,
          recipient: notification.recipient,
          subject: notification.subject,
          body: notification.body,
          expiresAt: notification.expiresAt.toISOString(),
        },
        null,
        2,
      )}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );
    this.logger.log({
      event: 'notification_written',
      kind: notification.kind,
      path: target,
    });
    return { delivered: true, transport: 'file' };
  }
}
