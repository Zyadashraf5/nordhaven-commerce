/**
 * The Notifications capability's published contract.
 *
 * A notification is a **delivery attempt** of a message the platform produced. The capability owns
 * the message, the provider abstraction, and the delivery record, and every provider-specific type
 * is confined to the adapter that implements it, so a new channel is an adapter rather than a change
 * to the platform's rules.
 *
 * **HC-DEC-014 leaves the channel open.** The only shipped transports are local test transports and
 * the transport that sends nothing, and the production configuration therefore delivers no customer
 * message at all until a channel is approved.
 */

/** The kinds of customer message the platform produces. */
export type CustomerNotificationKind =
  | 'REVIEW_APPROVED'
  | 'REVIEW_REJECTED'
  | 'SHIPMENT_HANDED_OVER'
  | 'SHIPMENT_DELIVERED'
  | 'RETURN_REFUNDED';

/** Who receives a customer message. The provider resolves the address. */
export interface NotificationRecipient {
  /** The recipient, as a stable identifier. */
  readonly userId: string;
}

/** One customer message. */
export interface CustomerNotification {
  /** Durable provider idempotency identity; never derived from a timestamp. */
  readonly deliveryKey: string;
  /** The platform's own name for the message. */
  readonly kind: CustomerNotificationKind;
  readonly recipient: NotificationRecipient;
  readonly subject: string;
  readonly body: string;
  /** The non-sensitive facts the message was produced from. */
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

/** What a provider answered about one delivery. */
export interface NotificationDeliveryResult {
  /** True when the provider accepted the message. */
  readonly delivered: boolean;
  /** The provider's own name, which the platform records. */
  readonly transport: string;
  /** The provider's own reference, when it has one. */
  readonly providerReference?: string | undefined;
  /** A fixed, non-sensitive reason when the delivery did not happen. */
  readonly failureReason?: string | undefined;
}

/**
 * A notification provider.
 *
 * The interface is deliberately small: the platform asks a provider to deliver one message, and the
 * provider's own vocabulary never becomes a core domain model.
 */
export interface NotificationProvider {
  /** The provider's own name, which the platform records on every delivery. */
  readonly name: string;
  /**
   * True when the provider may operate.
   *
   * The shipped test transports refuse to operate in a production environment, so a production
   * request can never deliver a customer message through them.
   */
  isAvailable(): boolean;
  /** Delivers one message. */
  deliver(notification: CustomerNotification): Promise<NotificationDeliveryResult>;
}

/** The injection token the Notifications capability publishes its provider registry under. */
export const NOTIFICATION_PROVIDER = Symbol('NOTIFICATION_PROVIDER');

/** A request to notify a customer. */
export interface NotificationRequest {
  readonly kind: CustomerNotificationKind;
  /** The recipient, as a stable identifier. */
  readonly recipientUserId: string;
  readonly subject: string;
  readonly body: string;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  /**
   * The stable business key of the request.
   *
   * A repeated request with the same key produces the same notification, so a retried workflow
   * cannot deliver the same message twice.
   */
  readonly idempotencyKey: string;
}

/** The outcome of a notification request. */
export interface NotificationOutcome {
  readonly notificationId: string;
  readonly status: 'PENDING' | 'DELIVERED' | 'FAILED' | 'SKIPPED';
  readonly transport: string | null;
  readonly delivered: boolean;
}

/**
 * The Notifications capability's published contract.
 *
 * Another capability that must tell a customer something asks through it, so the message and its
 * delivery record have one owner and one reader.
 */
export interface NotificationSender {
  stateCounts(): Promise<readonly { state: string; count: number }[]>;

  notify(request: NotificationRequest): Promise<NotificationOutcome>;
  enqueue(request: NotificationRequest): Promise<NotificationOutcome>;
  dispatch(notificationId: string, actorUserId?: string | null): Promise<NotificationOutcome>;
  /** Every message the platform produced, newest first. */
  listAll(limit: number): Promise<readonly NotificationRecord[]>;
  /** The messages addressed to one recipient, newest first. */
  listForRecipientOf(
    recipientUserId: string,
    limit: number,
  ): Promise<readonly NotificationRecord[]>;
}

/** One message, as the Notifications capability persists it. */
export interface NotificationRecord {
  readonly id: string;
  readonly kind: string;
  readonly recipientUserId: string;
  readonly subject: string;
  readonly body: string;
  readonly status: 'PENDING' | 'DELIVERED' | 'FAILED' | 'SKIPPED';
  readonly provider: string | null;
  readonly providerReference: string | null;
  readonly failureReason: string | null;
  readonly createdAt: Date;
  readonly sentAt: Date | null;
}

/** The injection token the Notifications capability publishes its sender under. */
export const NOTIFICATION_SENDER = Symbol('NOTIFICATION_SENDER');
