import { HttpException } from '@nestjs/common';

/**
 * Closed set of application error codes that may reach a client.
 *
 * Adding an entry is a contract change: it must be recorded in the owning milestone's contract and
 * the OpenAPI error table. Any code outside this union is a compile error, so an unreviewed code
 * cannot be published.
 */
export type AppErrorCode =
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_CHALLENGE'
  | 'INVALID_MFA_CODE'
  | 'INVALID_RECOVERY_TOKEN'
  | 'FORBIDDEN'
  | 'SESSION_NOT_FOUND'
  | 'ADDRESS_NOT_FOUND'
  | 'CATEGORY_NOT_FOUND'
  | 'BRAND_NOT_FOUND'
  | 'PRODUCT_NOT_FOUND'
  | 'VARIANT_NOT_FOUND'
  | 'CART_ITEM_NOT_FOUND'
  | 'WISHLIST_ITEM_NOT_FOUND'
  | 'INVENTORY_NOT_FOUND'
  | 'RESERVATION_NOT_FOUND'
  | 'BUNDLE_NOT_FOUND'
  | 'TAX_RULE_NOT_FOUND'
  | 'CHECKOUT_DESTINATION_NOT_FOUND'
  | 'ORDER_NOT_FOUND'
  | 'PRE_ORDER_NOT_FOUND'
  | 'SHIPMENT_NOT_FOUND'
  | 'RETURN_NOT_FOUND'
  | 'SHIPPING_DESTINATION_NOT_FOUND'
  | 'SHIPPING_METHOD_NOT_FOUND'
  | 'REVIEW_NOT_FOUND'
  | 'NOTIFICATION_NOT_FOUND'
  | 'CUSTOMER_NOT_FOUND'
  | 'PAYMENT_NOT_FOUND'
  | 'REFUND_NOT_FOUND'
  | 'REGISTRATION_NOT_ALLOWED'
  | 'MFA_ALREADY_ENROLLED'
  | 'CATALOG_CONFLICT'
  | 'INVENTORY_CONFLICT'
  | 'TAX_RULE_CONFLICT'
  | 'ORDER_NOT_READY'
  | 'ORDER_QUOTE_CHANGED'
  | 'ORDER_NOT_CANCELLABLE'
  | 'SHIPMENT_NOT_TRANSITIONABLE'
  | 'SHIPMENT_ALREADY_EXISTS'
  | 'RETURN_NOT_TRANSITIONABLE'
  | 'REVIEW_NOT_ELIGIBLE'
  | 'REVIEW_ALREADY_EXISTS'
  | 'REVIEW_NOT_MODERATABLE'
  | 'REVIEW_NOT_EDITABLE'
  | 'NOTIFICATION_FAILED'
  | 'PAYMENT_NOT_PAYABLE'
  | 'REFUND_NOT_ALLOWED'
  | 'REFUND_EXCEEDS_PAYMENT'
  | 'PAYMENT_EVENT_UNVERIFIED'
  | 'RATE_LIMITED';

const STATUS_BY_CODE: Readonly<Record<AppErrorCode, number>> = {
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  INVALID_CHALLENGE: 401,
  INVALID_MFA_CODE: 401,
  INVALID_RECOVERY_TOKEN: 400,
  FORBIDDEN: 403,
  SESSION_NOT_FOUND: 404,
  ADDRESS_NOT_FOUND: 404,
  CATEGORY_NOT_FOUND: 404,
  BRAND_NOT_FOUND: 404,
  PRODUCT_NOT_FOUND: 404,
  VARIANT_NOT_FOUND: 404,
  CART_ITEM_NOT_FOUND: 404,
  WISHLIST_ITEM_NOT_FOUND: 404,
  INVENTORY_NOT_FOUND: 404,
  RESERVATION_NOT_FOUND: 404,
  BUNDLE_NOT_FOUND: 404,
  TAX_RULE_NOT_FOUND: 404,
  CHECKOUT_DESTINATION_NOT_FOUND: 404,
  ORDER_NOT_FOUND: 404,
  PRE_ORDER_NOT_FOUND: 404,
  SHIPMENT_NOT_FOUND: 404,
  RETURN_NOT_FOUND: 404,
  SHIPPING_DESTINATION_NOT_FOUND: 404,
  SHIPPING_METHOD_NOT_FOUND: 404,
  REVIEW_NOT_FOUND: 404,
  NOTIFICATION_NOT_FOUND: 404,
  CUSTOMER_NOT_FOUND: 404,
  PAYMENT_NOT_FOUND: 404,
  REFUND_NOT_FOUND: 404,
  REGISTRATION_NOT_ALLOWED: 409,
  MFA_ALREADY_ENROLLED: 409,
  CATALOG_CONFLICT: 409,
  INVENTORY_CONFLICT: 409,
  TAX_RULE_CONFLICT: 409,
  ORDER_NOT_READY: 409,
  ORDER_QUOTE_CHANGED: 409,
  ORDER_NOT_CANCELLABLE: 409,
  SHIPMENT_NOT_TRANSITIONABLE: 409,
  SHIPMENT_ALREADY_EXISTS: 409,
  RETURN_NOT_TRANSITIONABLE: 409,
  REVIEW_NOT_ELIGIBLE: 409,
  REVIEW_ALREADY_EXISTS: 409,
  REVIEW_NOT_MODERATABLE: 409,
  REVIEW_NOT_EDITABLE: 409,
  NOTIFICATION_FAILED: 503,
  PAYMENT_NOT_PAYABLE: 409,
  REFUND_NOT_ALLOWED: 409,
  REFUND_EXCEEDS_PAYMENT: 409,
  PAYMENT_EVENT_UNVERIFIED: 401,
  RATE_LIMITED: 429,
};

/**
 * Constant, non-sensitive messages. A message MUST never include a submitted value, an identifier
 * from the database, or any authentication material.
 */
const MESSAGE_BY_CODE: Readonly<Record<AppErrorCode, string>> = {
  UNAUTHENTICATED: 'Authentication is required',
  INVALID_CREDENTIALS: 'Invalid email or password',
  INVALID_CHALLENGE: 'The authentication challenge is no longer valid',
  INVALID_MFA_CODE: 'The verification code is not valid',
  INVALID_RECOVERY_TOKEN: 'The recovery token is not valid',
  FORBIDDEN: 'The operation is not permitted',
  SESSION_NOT_FOUND: 'Session not found',
  ADDRESS_NOT_FOUND: 'Address not found',
  CATEGORY_NOT_FOUND: 'Category not found',
  BRAND_NOT_FOUND: 'Brand not found',
  PRODUCT_NOT_FOUND: 'Product not found',
  VARIANT_NOT_FOUND: 'Variant not found',
  CART_ITEM_NOT_FOUND: 'Cart item not found',
  WISHLIST_ITEM_NOT_FOUND: 'Wishlist item not found',
  INVENTORY_NOT_FOUND: 'Inventory item not found',
  RESERVATION_NOT_FOUND: 'Reservation not found',
  BUNDLE_NOT_FOUND: 'Bundle not found',
  TAX_RULE_NOT_FOUND: 'Tax rule not found',
  CHECKOUT_DESTINATION_NOT_FOUND: 'Checkout destination not found',
  ORDER_NOT_FOUND: 'Order not found',
  PRE_ORDER_NOT_FOUND: 'Pre-order not found',
  SHIPMENT_NOT_FOUND: 'Shipment not found',
  RETURN_NOT_FOUND: 'Return not found',
  SHIPPING_DESTINATION_NOT_FOUND: 'Shipping destination not found',
  SHIPPING_METHOD_NOT_FOUND: 'Shipping method not found',
  REVIEW_NOT_FOUND: 'Review not found',
  NOTIFICATION_NOT_FOUND: 'Notification not found',
  CUSTOMER_NOT_FOUND: 'Customer not found',
  PAYMENT_NOT_FOUND: 'Payment not found',
  REFUND_NOT_FOUND: 'Refund not found',
  REGISTRATION_NOT_ALLOWED: 'Registration could not be completed',
  MFA_ALREADY_ENROLLED: 'Multi-factor authentication is already enrolled',
  CATALOG_CONFLICT: 'The change conflicts with existing catalog state',
  INVENTORY_CONFLICT: 'The change conflicts with existing inventory state',
  TAX_RULE_CONFLICT: 'The change conflicts with existing tax configuration',
  ORDER_NOT_READY: 'The cart is not ready to be ordered',
  ORDER_QUOTE_CHANGED: 'The price changed and must be confirmed again',
  ORDER_NOT_CANCELLABLE: 'The order can no longer be cancelled',
  SHIPMENT_NOT_TRANSITIONABLE: 'The shipment cannot move to that state',
  SHIPMENT_ALREADY_EXISTS: 'A shipment already exists for that order',
  RETURN_NOT_TRANSITIONABLE: 'The return cannot move to that state',
  REVIEW_NOT_ELIGIBLE: 'The review is not eligible for this purchase',
  REVIEW_ALREADY_EXISTS: 'A review already exists for this product',
  REVIEW_NOT_MODERATABLE: 'The review cannot be moderated in its current state',
  REVIEW_NOT_EDITABLE: 'The review can no longer be edited',
  NOTIFICATION_FAILED: 'The notification could not be delivered',
  PAYMENT_NOT_PAYABLE: 'The order is not awaiting payment',
  REFUND_NOT_ALLOWED: 'The payment cannot be refunded',
  REFUND_EXCEEDS_PAYMENT: 'The refund exceeds the amount that can be refunded',
  PAYMENT_EVENT_UNVERIFIED: 'The payment event could not be verified',
  RATE_LIMITED: 'Too many requests',
};

export interface AppErrorOptions {
  readonly details?: unknown;
  readonly retryAfterSeconds?: number;
}

/**
 * A trustworthy, project-authored HTTP error.
 *
 * `SafeExceptionFilter` honours the code, message, details, and `Retry-After` value of this class
 * only. Every other exception keeps the Milestone 01 status-based mapping, so request-derived text
 * can never reach an error body.
 */
export class AppError extends HttpException {
  public readonly code: AppErrorCode;
  public readonly safeMessage: string;
  public readonly retryAfterSeconds: number | undefined;

  public constructor(code: AppErrorCode, options: AppErrorOptions = {}) {
    const safeMessage = MESSAGE_BY_CODE[code];
    super(
      {
        code,
        message: safeMessage,
        ...(options.details === undefined ? {} : { details: options.details }),
      },
      STATUS_BY_CODE[code],
    );
    this.name = 'AppError';
    this.code = code;
    this.safeMessage = safeMessage;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  public static unauthenticated(): AppError {
    return new AppError('UNAUTHENTICATED');
  }

  public static invalidCredentials(): AppError {
    return new AppError('INVALID_CREDENTIALS');
  }

  public static invalidChallenge(): AppError {
    return new AppError('INVALID_CHALLENGE');
  }

  public static invalidMfaCode(): AppError {
    return new AppError('INVALID_MFA_CODE');
  }

  public static invalidRecoveryToken(): AppError {
    return new AppError('INVALID_RECOVERY_TOKEN');
  }

  public static forbidden(): AppError {
    return new AppError('FORBIDDEN');
  }

  public static sessionNotFound(): AppError {
    return new AppError('SESSION_NOT_FOUND');
  }

  public static addressNotFound(): AppError {
    return new AppError('ADDRESS_NOT_FOUND');
  }

  public static categoryNotFound(): AppError {
    return new AppError('CATEGORY_NOT_FOUND');
  }

  public static brandNotFound(): AppError {
    return new AppError('BRAND_NOT_FOUND');
  }

  public static productNotFound(): AppError {
    return new AppError('PRODUCT_NOT_FOUND');
  }

  public static variantNotFound(): AppError {
    return new AppError('VARIANT_NOT_FOUND');
  }

  public static cartItemNotFound(): AppError {
    return new AppError('CART_ITEM_NOT_FOUND');
  }

  public static wishlistItemNotFound(): AppError {
    return new AppError('WISHLIST_ITEM_NOT_FOUND');
  }

  public static inventoryNotFound(): AppError {
    return new AppError('INVENTORY_NOT_FOUND');
  }

  public static reservationNotFound(): AppError {
    return new AppError('RESERVATION_NOT_FOUND');
  }

  public static bundleNotFound(): AppError {
    return new AppError('BUNDLE_NOT_FOUND');
  }

  public static taxRuleNotFound(): AppError {
    return new AppError('TAX_RULE_NOT_FOUND');
  }

  public static checkoutDestinationNotFound(): AppError {
    return new AppError('CHECKOUT_DESTINATION_NOT_FOUND');
  }

  public static catalogConflict(): AppError {
    return new AppError('CATALOG_CONFLICT');
  }

  public static inventoryConflict(): AppError {
    return new AppError('INVENTORY_CONFLICT');
  }

  public static taxRuleConflict(): AppError {
    return new AppError('TAX_RULE_CONFLICT');
  }

  public static orderNotFound(): AppError {
    return new AppError('ORDER_NOT_FOUND');
  }

  public static preOrderNotFound(): AppError {
    return new AppError('PRE_ORDER_NOT_FOUND');
  }

  public static shipmentNotFound(): AppError {
    return new AppError('SHIPMENT_NOT_FOUND');
  }

  public static returnNotFound(): AppError {
    return new AppError('RETURN_NOT_FOUND');
  }

  public static shippingDestinationNotFound(): AppError {
    return new AppError('SHIPPING_DESTINATION_NOT_FOUND');
  }

  public static shippingMethodNotFound(): AppError {
    return new AppError('SHIPPING_METHOD_NOT_FOUND');
  }

  /**
   * The shipment cannot move to the requested state.
   *
   * The reason is a fixed, non-sensitive name, so the refusal names the failure without echoing
   * anything an attacker supplied.
   */
  public static shipmentNotTransitionable(reason = 'TRANSITION_NOT_PERMITTED'): AppError {
    return new AppError('SHIPMENT_NOT_TRANSITIONABLE', { details: { reason } });
  }

  /** A shipment already exists for the order, so the goods are not sent twice. */
  public static shipmentAlreadyExists(): AppError {
    return new AppError('SHIPMENT_ALREADY_EXISTS');
  }

  /** The return cannot move to the requested state. */
  public static returnNotTransitionable(reason = 'TRANSITION_NOT_PERMITTED'): AppError {
    return new AppError('RETURN_NOT_TRANSITIONABLE', { details: { reason } });
  }

  public static reviewNotFound(): AppError {
    return new AppError('REVIEW_NOT_FOUND');
  }

  /** The customer holds no paid order that contains the reviewed product. */
  public static reviewNotEligible(): AppError {
    return new AppError('REVIEW_NOT_ELIGIBLE');
  }

  /** The customer already reviewed this product. */
  public static reviewAlreadyExists(): AppError {
    return new AppError('REVIEW_ALREADY_EXISTS');
  }

  /** The review is no longer held for moderation. */
  public static reviewNotModeratable(): AppError {
    return new AppError('REVIEW_NOT_MODERATABLE');
  }

  /** The review has already been published or refused, so it can no longer be edited. */
  public static reviewNotEditable(): AppError {
    return new AppError('REVIEW_NOT_EDITABLE');
  }

  public static notificationNotFound(): AppError {
    return new AppError('NOTIFICATION_NOT_FOUND');
  }

  /** The platform holds no record of this customer. */
  public static customerNotFound(): AppError {
    return new AppError('CUSTOMER_NOT_FOUND');
  }

  /** The provider did not accept the message. */
  public static notificationFailed(notificationId: string): AppError {
    return new AppError('NOTIFICATION_FAILED', { details: { notificationId } });
  }

  /** The cart cannot be checked out. The reasons are named so the customer can fix them. */
  public static orderNotReady(reasons: readonly string[]): AppError {
    return new AppError('ORDER_NOT_READY', { details: { reasons: [...reasons] } });
  }

  /** The price changed between the confirmation and the order, so it must be confirmed again. */
  public static orderQuoteChanged(): AppError {
    return new AppError('ORDER_QUOTE_CHANGED');
  }

  /** A paid order needs the refund workflow rather than a silent cancellation. */
  public static orderNotCancellable(): AppError {
    return new AppError('ORDER_NOT_CANCELLABLE');
  }

  public static paymentNotFound(): AppError {
    return new AppError('PAYMENT_NOT_FOUND');
  }

  public static refundNotFound(): AppError {
    return new AppError('REFUND_NOT_FOUND');
  }

  /** The order is not awaiting payment, so a new attempt cannot be created for it. */
  public static paymentNotPayable(status: string): AppError {
    return new AppError('PAYMENT_NOT_PAYABLE', { details: { orderStatus: status } });
  }

  /** Only a successful payment can be refunded. */
  public static refundNotAllowed(status: string): AppError {
    return new AppError('REFUND_NOT_ALLOWED', { details: { paymentStatus: status } });
  }

  /** The refunds would exceed the amount that was paid. */
  public static refundExceedsPayment(remainingMinor: number): AppError {
    return new AppError('REFUND_EXCEEDS_PAYMENT', {
      details: { remainingRefundableMinor: remainingMinor },
    });
  }

  /**
   * The provider event could not be verified.
   *
   * The reason is a fixed, non-sensitive name, so the refusal names the failure without echoing
   * anything an attacker supplied.
   */
  public static paymentEventUnverified(reason = 'VERIFICATION_FAILED'): AppError {
    return new AppError('PAYMENT_EVENT_UNVERIFIED', { details: { reason } });
  }

  public static registrationNotAllowed(): AppError {
    return new AppError('REGISTRATION_NOT_ALLOWED');
  }

  public static mfaAlreadyEnrolled(): AppError {
    return new AppError('MFA_ALREADY_ENROLLED');
  }

  public static rateLimited(retryAfterSeconds: number): AppError {
    return new AppError('RATE_LIMITED', {
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterSeconds)),
    });
  }
}
