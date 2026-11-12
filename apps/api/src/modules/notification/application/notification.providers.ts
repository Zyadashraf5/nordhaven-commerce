import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';
import { link, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Logger } from '@nestjs/common';
import type {
  CustomerNotification,
  NotificationDeliveryResult,
  NotificationProvider,
} from '../contracts';

/**
 * The development transport.
 *
 * It writes the delivery artifact under an ignored working directory so a developer can complete a
 * workflow without a real channel, and it **refuses to construct in a production environment**, so
 * the development convenience can never become a production delivery path. Only the artifact path is
 * logged; the message body is never logged.
 */
export class FileNotificationProvider implements NotificationProvider {
  public readonly name = 'file';
  private readonly logger = new Logger(FileNotificationProvider.name);

  public constructor(private readonly directory: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('The file notification provider is not permitted in production');
    }
  }

  public isAvailable(): boolean {
    return process.env.NODE_ENV !== 'production';
  }

  public async deliver(notification: CustomerNotification): Promise<NotificationDeliveryResult> {
    if (!this.isAvailable()) {
      return { delivered: false, transport: this.name, failureReason: 'PROVIDER_UNAVAILABLE' };
    }
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        notification.deliveryKey,
      )
    )
      throw new Error('Invalid local delivery identity');
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const target = path.join(this.directory, `${notification.deliveryKey}.json`);
    const staging = path.join(this.directory, '.' + randomUUID() + '.pending');
    const payload = JSON.stringify({
      kind: notification.kind,
      recipientUserId: notification.recipient.userId,
      subject: notification.subject,
      body: notification.body,
      metadata: notification.metadata ?? {},
    });
    try {
      await writeFile(staging, payload, { encoding: 'utf8', mode: 0o600, flag: 'wx', flush: true });
      try {
        await link(staging, target);
      } catch (error) {
        if (
          typeof error !== 'object' ||
          error === null ||
          !('code' in error) ||
          error.code !== 'EEXIST'
        )
          throw error;
        let matches = false;
        try {
          matches = isDeepStrictEqual(
            JSON.parse(await readFile(target, 'utf8')),
            JSON.parse(payload),
          );
        } catch {
          /* An unreadable artifact cannot acknowledge delivery. */
        }
        if (!matches) throw new Error('Local delivery artifact integrity mismatch');
      }
    } finally {
      await unlink(staging).catch((error: unknown) => {
        if (
          typeof error !== 'object' ||
          error === null ||
          !('code' in error) ||
          error.code !== 'ENOENT'
        )
          throw error;
      });
    }
    this.logger.log({ event: 'notification_written', kind: notification.kind, path: target });
    return { delivered: true, transport: this.name, providerReference: path.basename(target) };
  }
}

/**
 * The test transport.
 *
 * It captures the messages in memory so a suite can assert on them without any external channel.
 * It is never selected outside a test configuration, and it refuses to operate in production.
 */
export class MemoryNotificationProvider implements NotificationProvider {
  public readonly name = 'memory';
  private readonly notifications: CustomerNotification[] = [];
  private readonly deliveredKeys = new Set<string>();

  public isAvailable(): boolean {
    return process.env.NODE_ENV !== 'production';
  }

  public deliver(notification: CustomerNotification): Promise<NotificationDeliveryResult> {
    if (!this.isAvailable()) {
      return Promise.resolve({
        delivered: false,
        transport: this.name,
        failureReason: 'PROVIDER_UNAVAILABLE',
      });
    }
    if (this.deliveredKeys.has(notification.deliveryKey))
      return Promise.resolve({
        delivered: true,
        transport: this.name,
        providerReference: `memory-${notification.deliveryKey}`,
      });
    this.deliveredKeys.add(notification.deliveryKey);
    this.notifications.push(notification);
    return Promise.resolve({
      delivered: true,
      transport: this.name,
      providerReference: `memory-${notification.deliveryKey}`,
    });
  }

  public get delivered(): readonly CustomerNotification[] {
    return this.notifications;
  }

  public clear(): void {
    this.notifications.length = 0;
    this.deliveredKeys.clear();
  }
}

/**
 * The transport that sends nothing.
 *
 * It is the default, because HC-DEC-014 leaves the channel open. The workflow still succeeds and
 * the notification is still recorded, so the platform knows what it would have sent.
 */
export class NoopNotificationProvider implements NotificationProvider {
  public readonly name = 'none';

  public isAvailable(): boolean {
    return false;
  }

  public deliver(): Promise<NotificationDeliveryResult> {
    return Promise.resolve({ delivered: false, transport: this.name, failureReason: 'NO_CHANNEL' });
  }
}
