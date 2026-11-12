import { Controller, Get, Header, Param, Post, HttpCode } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppError } from '../../../platform/http/app-error';
import { errors } from '../../../platform/http/openapi-error-responses';
import { CurrentPrincipal, Roles } from '../../../platform/security/access.decorators';
import type { AuthenticatedPrincipal } from '../../../platform/security/principal';
import { RateLimit } from '../../../platform/security/rate-limit.decorator';
import { NotificationService } from '../application/notification.service';
import { NOTIFICATION_RATE_LIMITS } from './notification.policies';
import { NotificationIdParam } from './notification.request';
import {
  NotificationResponse,
  NotificationsResponse,
  toNotificationResponse,
  toNotificationsResponse,
} from './notification.response';

/**
 * The notifications addressed to the authenticated customer.
 *
 * Every route is scoped to the presented session's principal, so a customer can read only the
 * messages the platform produced for them. The body of a notification is the platform's own text,
 * and it never carries recovery material or any other secret.
 */
@ApiTags('Notifications')
@Roles('CUSTOMER')
@Controller({ path: 'notifications', version: '1' })
export class CustomerNotificationController {
  public constructor(private readonly notifications: NotificationService) {}

  @Get()
  @RateLimit(NOTIFICATION_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listCustomerNotifications',
    summary: 'List the messages the platform produced for the authenticated customer',
    description:
      'A message is recorded even when the channel sends nothing, so the customer sees what the platform would have sent.',
  })
  @ApiResponse({
    status: 200,
    description: "The customer's messages.",
    type: NotificationsResponse,
  })
  @errors(400, 401, 403, 429, 500, 503)
  public async list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<NotificationsResponse> {
    return toNotificationsResponse(await this.notifications.listForRecipient(principal.userId, 50));
  }

  @Get(':notificationId')
  @RateLimit(NOTIFICATION_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'notificationId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'getCustomerNotification',
    summary: 'Read one of the messages of the authenticated customer',
  })
  @ApiResponse({ status: 200, description: 'The message.', type: NotificationResponse })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async read(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: NotificationIdParam,
  ): Promise<NotificationResponse> {
    const notification = await this.notifications.findById(params.notificationId);
    if (notification === null || notification.recipientUserId !== principal.userId) {
      throw AppError.notificationNotFound();
    }
    return toNotificationResponse(notification);
  }
}

/**
 * The administrative notification surface.
 *
 * Every route requires the `ADMIN` role. The surface reads the delivery record, which is how an
 * operator sees what the platform tried to send and whether the channel accepted it.
 */
@ApiTags('Notifications')
@Roles('ADMIN')
@Controller({ path: 'admin/notifications', version: '1' })
export class AdminNotificationController {
  public constructor(private readonly notifications: NotificationService) {}

  @Post(':notificationId/retry')
  @HttpCode(200)
  @RateLimit(NOTIFICATION_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'notificationId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'retryAdminNotification',
    summary: 'Retry a persisted local notification',
    description:
      'Only approved local/test transports are available. Production binds the transport that sends nothing. Delivered notifications are not sent again; an active lease remains pending.',
  })
  @ApiResponse({
    status: 200,
    description: 'The current notification state.',
    type: NotificationResponse,
  })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async retry(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: NotificationIdParam,
  ): Promise<NotificationResponse> {
    await this.notifications.dispatch(params.notificationId, principal.userId);
    const record = await this.notifications.findById(params.notificationId);
    if (record === null) throw AppError.notificationNotFound();
    return toNotificationResponse(record);
  }

  @Get()
  @RateLimit(NOTIFICATION_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listAdminNotifications',
    summary: 'List every message the platform produced',
    description:
      'The delivery record is the operational evidence: what was sent, through which provider, and why a delivery did not happen.',
  })
  @ApiResponse({ status: 200, description: 'The messages.', type: NotificationsResponse })
  @errors(400, 401, 403, 429, 500, 503)
  public async list(): Promise<NotificationsResponse> {
    return toNotificationsResponse(await this.notifications.list(50));
  }
}
