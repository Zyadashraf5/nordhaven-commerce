/**
 * The Reviews capability's published contract.
 *
 * A review is a customer's own statement about a product they bought, and it is **held for
 * moderation** before it is public. The eligibility rule is structural: a review may only be
 * written by a customer who holds a **paid** order that contains the reviewed product, and the
 * order that proves it is recorded on the review.
 */

/** The states a review may hold. */
export type ReviewStatusValue = 'PENDING' | 'APPROVED' | 'REJECTED';

/** Who caused a transition. */
export type ReviewActorValue = 'CUSTOMER' | 'ADMIN' | 'SYSTEM';

/** One review, as the capability persists it. */
export interface ReviewRecord {
  readonly id: string;
  readonly productId: string;
  readonly customerId: string;
  /** The paid order that proves the purchase, when the review is a verified purchase. */
  readonly orderId: string | null;
  readonly rating: number;
  readonly title: string;
  readonly body: string;
  readonly status: ReviewStatusValue;
  readonly verifiedPurchase: boolean;
  readonly moderatedByUserId: string | null;
  readonly moderatedAt: Date | null;
  readonly moderationReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** One recorded review transition. */
export interface ReviewEventRecord {
  readonly id: string;
  readonly reviewId: string;
  readonly eventType: string;
  readonly previousStatus: ReviewStatusValue | null;
  readonly nextStatus: ReviewStatusValue | null;
  readonly actor: ReviewActorValue;
  readonly actorUserId: string | null;
  readonly reason: string | null;
  readonly detail: unknown;
  readonly createdAt: Date;
}

/**
 * The Reviews capability's published contract.
 *
 * The administrative surface of the milestone reads and acts through it, and a later capability
 * that must know whether a product has public reviews asks through it as well.
 */
export interface ReviewLibrary {
  stateCounts(): Promise<readonly { state: string; count: number }[]>;
  customerIdsAfter(cursor: string | null, limit: number): Promise<readonly string[]>;
  customerCounts(ids: readonly string[]): Promise<readonly { customerId: string; count: number }[]>;
  recordIdsForCustomer(customerId: string, limit: number): Promise<readonly string[]>;

  /** The approved reviews of a product, newest first. These are the only public ones. */
  approvedReviewsOf(productId: string, limit: number): Promise<readonly ReviewRecord[]>;
  /** One review by its identifier. */
  reviewOf(reviewId: string): Promise<ReviewRecord | null>;
  /** Every review, newest first. */
  listAll(limit: number): Promise<readonly ReviewRecord[]>;
  /** The reviews of one customer, newest first. */
  listForCustomerOf(customerId: string, limit: number): Promise<readonly ReviewRecord[]>;
}

/** The injection token the Reviews capability publishes its library under. */
export const REVIEW_LIBRARY = Symbol('REVIEW_LIBRARY');
