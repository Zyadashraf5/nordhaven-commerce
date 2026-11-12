import { DatabaseService } from '../../../platform/database/database.service';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../platform/http/app-error';
import { ORDER_LEDGER, type OrderLedger } from '../../order';
import { NOTIFICATION_SENDER, type NotificationSender } from '../../notification';
import type { ReviewLibrary, ReviewRecord, ReviewStatusValue } from '../contracts';
import { ReviewRepository, type ReviewEventAttributes } from '../persistence/review.repository';

/** The largest rating a review may carry. */
export const MAX_REVIEW_RATING = 5;

/** The smallest rating a review may carry. */
export const MIN_REVIEW_RATING = 1;

/** The largest number of characters a review's title may carry. */
export const MAX_REVIEW_TITLE_LENGTH = 120;

/** The largest number of characters a review's body may carry. */
export const MAX_REVIEW_BODY_LENGTH = 4000;

/**
 * The Reviews capability.
 *
 * The service owns the rules; the repository owns the atomicity.
 *
 * **The eligibility rule is structural.** A review may only be written by a customer who holds a
 * paid order that contains the reviewed product, and the order that proves it is recorded on the
 * review, so "this is a verified purchase" is a property of the record rather than of a code path.
 *
 * **Every review is held for moderation.** A review is published only after an administrator
 * approves it, and the decision is recorded in an append-only event log.
 */
@Injectable()
export class ReviewService implements ReviewLibrary {
  public constructor(
    private readonly reviews: ReviewRepository,
    private readonly database: DatabaseService,
    @Inject(ORDER_LEDGER) private readonly orders: OrderLedger,
    @Inject(NOTIFICATION_SENDER) private readonly notifications: NotificationSender,
  ) {}

  /**
   * Records a customer's review of a product.
   *
   * The request is refused unless the customer holds a paid order that contains the product, and a
   * second review of the same product by the same customer is refused by the unique key, so a
   * customer cannot flood a product with statements.
   */
  public async create(input: {
    readonly productId: string;
    readonly customerId: string;
    readonly rating: number;
    readonly title: string;
    readonly body: string;
  }): Promise<ReviewRecord> {
    if (
      !Number.isInteger(input.rating) ||
      input.rating < MIN_REVIEW_RATING ||
      input.rating > MAX_REVIEW_RATING
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: [{ path: 'rating', message: 'Invalid value' }],
      });
    }
    const title = input.title.trim();
    const body = input.body.trim();
    if (title.length === 0 || title.length > MAX_REVIEW_TITLE_LENGTH) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: [{ path: 'title', message: 'Invalid value' }],
      });
    }
    if (body.length === 0 || body.length > MAX_REVIEW_BODY_LENGTH) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: [{ path: 'body', message: 'Invalid value' }],
      });
    }

    return this.database.transaction(async () => {
      await this.database.lock(`review-key:${input.customerId}:${input.productId}`);
      const purchase = await this.orders.purchaseForProduct(input.customerId, input.productId);
      if (purchase === null) throw AppError.reviewNotEligible();

      const existing = await this.reviews.findForCustomerAndProduct(
        input.customerId,
        input.productId,
      );
      if (existing !== null) throw AppError.reviewAlreadyExists();

      const event: ReviewEventAttributes = {
        eventType: 'REVIEW_SUBMITTED',
        previousStatus: null,
        nextStatus: 'PENDING',
        actor: 'CUSTOMER',
        actorUserId: input.customerId,
        reason: null,
        detail: { productId: input.productId, verifiedPurchase: true },
      };
      return this.reviews.create({
        productId: input.productId,
        customerId: input.customerId,
        orderId: purchase.id,
        rating: input.rating,
        title,
        body,
        verifiedPurchase: true,
        event,
      });
    });
  }

  /** One review by its identifier. */
  public async reviewOf(reviewId: string): Promise<ReviewRecord | null> {
    return this.reviews.findById(reviewId);
  }

  /** The approved reviews of a product. These are the only public ones. */
  public async approvedReviewsOf(
    productId: string,
    limit: number,
  ): Promise<readonly ReviewRecord[]> {
    return this.reviews.listApprovedForProduct(productId, limit);
  }

  /** The reviews of one customer, newest first. */
  public async listForCustomer(
    customerId: string,
    limit: number,
  ): Promise<readonly ReviewRecord[]> {
    return this.reviews.listForCustomer(customerId, limit);
  }

  /** Every review, newest first. */
  public async list(limit: number): Promise<readonly ReviewRecord[]> {
    return this.reviews.list(limit);
  }

  /** Every review, newest first, for the administrative surface. */
  public async listAll(limit: number): Promise<readonly ReviewRecord[]> {
    return this.reviews.list(limit);
  }

  /** The reviews of one customer, newest first, for the administrative surface. */
  public async listForCustomerOf(
    customerId: string,
    limit: number,
  ): Promise<readonly ReviewRecord[]> {
    return this.reviews.listForCustomer(customerId, limit);
  }

  /** The reviews that wait for a moderation decision, oldest first. */
  public async listPending(limit: number): Promise<readonly ReviewRecord[]> {
    return this.reviews.listPending(limit);
  }

  /** The recorded transitions of a review. */
  public async eventsOf(reviewId: string) {
    return this.reviews.listEvents(reviewId);
  }

  /**
   * Edits the author's own review while it is still held for moderation.
   *
   * An approved or a rejected review is immutable, so a customer cannot rewrite what the platform
   * has already published or refused.
   */
  public async edit(input: {
    readonly reviewId: string;
    readonly customerId: string;
    readonly rating: number;
    readonly title: string;
    readonly body: string;
  }): Promise<ReviewRecord> {
    const review = await this.reviews.findById(input.reviewId);
    if (review === null || review.customerId !== input.customerId) {
      throw AppError.reviewNotFound();
    }
    if (review.status !== 'PENDING') throw AppError.reviewNotEditable();
    if (
      !Number.isInteger(input.rating) ||
      input.rating < MIN_REVIEW_RATING ||
      input.rating > MAX_REVIEW_RATING
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: [{ path: 'rating', message: 'Invalid value' }],
      });
    }
    const title = input.title.trim();
    const body = input.body.trim();
    if (title.length === 0 || title.length > MAX_REVIEW_TITLE_LENGTH) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: [{ path: 'title', message: 'Invalid value' }],
      });
    }
    if (body.length === 0 || body.length > MAX_REVIEW_BODY_LENGTH) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: [{ path: 'body', message: 'Invalid value' }],
      });
    }
    const edited = await this.reviews.editPending({
      reviewId: input.reviewId,
      rating: input.rating,
      title,
      body,
      event: {
        eventType: 'REVIEW_EDITED',
        previousStatus: 'PENDING',
        nextStatus: 'PENDING',
        actor: 'CUSTOMER',
        actorUserId: input.customerId,
        reason: null,
      },
    });
    if (edited === null) throw AppError.reviewNotEditable();
    return edited;
  }

  /**
   * Approves or rejects a held review.
   *
   * The decision is the administrator's, and it is recorded with the reason. The author is then
   * notified through the Notifications capability, which records what it would have sent even
   * when the channel sends nothing.
   */
  public async moderate(input: {
    readonly reviewId: string;
    readonly decision: 'APPROVED' | 'REJECTED';
    readonly actorUserId: string | null;
    readonly reason: string | null;
  }): Promise<ReviewRecord> {
    return this.database.transaction(async () => {
      await this.database.lock('review:' + input.reviewId);
      const review = await this.reviews.findById(input.reviewId);
      if (review === null) throw AppError.reviewNotFound();
      if (review.status !== 'PENDING') {
        this.database.afterRollback(() =>
          this.reviews.recordEvent(input.reviewId, {
            eventType: 'REVIEW_DECISION_REFUSED',
            previousStatus: review.status,
            nextStatus: input.decision,
            actor: 'ADMIN',
            actorUserId: input.actorUserId,
            reason: 'TRANSITION_NOT_PERMITTED',
          }),
        );
        throw AppError.reviewNotModeratable();
      }

      const moderated = await this.reviews.moderate(
        input.reviewId,
        'PENDING',
        input.decision,
        {
          eventType: `REVIEW_${input.decision}`,
          previousStatus: 'PENDING',
          nextStatus: input.decision,
          actor: 'ADMIN',
          actorUserId: input.actorUserId,
          reason: input.reason,
        },
        {
          moderatedByUserId: input.actorUserId,
          moderatedAt: new Date(),
          moderationReason: input.reason,
        },
      );
      if (moderated === null) throw AppError.reviewNotModeratable();

      await this.notifications.notify({
        kind: input.decision === 'APPROVED' ? 'REVIEW_APPROVED' : 'REVIEW_REJECTED',
        recipientUserId: review.customerId,
        subject:
          input.decision === 'APPROVED'
            ? 'Your review has been published'
            : 'Your review was not published',
        body:
          input.decision === 'APPROVED'
            ? 'Your review of the product is now public.'
            : 'Your review of the product was not published. The reason is recorded with the decision.',
        metadata: { reviewId: review.id, productId: review.productId },
        idempotencyKey: `review:${review.id}:${input.decision.toLowerCase()}`,
      });

      return moderated;
    });
  }

  /** The review's state, for the caller that owns it. */
  public static ownedBy(review: ReviewRecord, customerId: string): boolean {
    return review.customerId === customerId;
  }

  /** The states a review may hold. */
  public static statuses(): readonly ReviewStatusValue[] {
    return ['PENDING', 'APPROVED', 'REJECTED'];
  }
  public async stateCounts(): Promise<readonly { state: string; count: number }[]> {
    return this.reviews.stateCounts();
  }
  public async customerIdsAfter(cursor: string | null, limit: number): Promise<readonly string[]> {
    return this.reviews.customerIdsAfter(cursor, limit);
  }
  public async customerCounts(
    ids: readonly string[],
  ): Promise<readonly { customerId: string; count: number }[]> {
    return this.reviews.customerCounts(ids);
  }
  public async recordIdsForCustomer(customerId: string, limit: number): Promise<readonly string[]> {
    return this.reviews.recordIdsForCustomer(customerId, limit);
  }
}
