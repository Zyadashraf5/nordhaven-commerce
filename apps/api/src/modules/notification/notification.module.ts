import { Module } from '@nestjs/common';
import path from 'node:path';
import {
  ENVIRONMENT_CONFIGURATION,
  type EnvironmentConfiguration,
} from '../../platform/config/environment';
import { NotificationService } from './application/notification.service';
import {
  FileNotificationProvider,
  MemoryNotificationProvider,
  NoopNotificationProvider,
} from './application/notification.providers';
import {
  AdminNotificationController,
  CustomerNotificationController,
} from './api/notification.controller';
import { NOTIFICATION_PROVIDER, NOTIFICATION_SENDER } from './contracts';
import { NotificationRepository } from './persistence/notification.repository';

/**
 * Notifications module.
 *
 * Owns the customer message, the provider abstraction, and the delivery record, and nothing else.
 * The only shipped providers are the **local test transports** and the transport that sends nothing,
 * because HC-DEC-014 leaves the channel open. The provider is bound through the
 * `NOTIFICATION_PROVIDER` token, so a real channel is a binding and not a change to the rules.
 */
@Module({
  controllers: [CustomerNotificationController, AdminNotificationController],
  providers: [
    NotificationRepository,
    NotificationService,
    {
      provide: NOTIFICATION_PROVIDER,
      inject: [ENVIRONMENT_CONFIGURATION],
      useFactory: (configuration: EnvironmentConfiguration) => {
        if (configuration.nodeEnv === 'production') return new NoopNotificationProvider();
        switch (configuration.customerNotificationTransport) {
          case 'memory':
            return new MemoryNotificationProvider();
          case 'file':
            return new FileNotificationProvider(path.join(process.cwd(), 'tmp', 'notifications'));
          default:
            return new NoopNotificationProvider();
        }
      },
    },
    { provide: NOTIFICATION_SENDER, useExisting: NotificationService },
  ],
  exports: [NOTIFICATION_PROVIDER, NOTIFICATION_SENDER],
})
export class NotificationModule {}
