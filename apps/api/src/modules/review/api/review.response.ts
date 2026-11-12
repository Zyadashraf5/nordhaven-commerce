import { ApiProperty } from '@nestjs/swagger';
import type { ReviewEventRecord, ReviewRecord } from '../contracts';

/**
 * Response projections.
 *
 * Each projection emits exactly the fields its DTO declares, and nothing else. A public review
 * never carries the author's identity, and it never carries the moderation internals.
 */

export class PublicReviewResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  public productId!: string;

  @ApiProperty({ type: Number, minimum: 1, maximum: 5 })
  public rating!: number;

  @ApiProperty({ type: String })
  public title!: string;

  @ApiProperty({ type: String })
  public body!: string;

  @ApiProperty({ type: Boolean })
  public verifiedPurchase!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;
}

export class ReviewResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  public productId!: string;

  @ApiProperty({ type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED'] })
  public status!: string;

  @ApiProperty({ type: Number, minimum: 1, maximum: 5 })
  public rating!: number;

  @ApiProperty({ type: String })
  public title!: string;

  @ApiProperty({ type: String })
  public body!: string;

  @ApiProperty({ type: Boolean })
  public verifiedPurchase!: boolean;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  public orderId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  public moderatedByUserId!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  public moderatedAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  public moderationReason!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;
}

export class ReviewsResponse {
  @ApiProperty({ type: [ReviewResponse] })
  public reviews!: ReviewResponse[];
}

export class PublicReviewsResponse {
  @ApiProperty({ type: [PublicReviewResponse] })
  public reviews!: PublicReviewResponse[];
}

export class ReviewEventResponse {
  @ApiProperty({ type: String })
  public eventType!: string;

  @ApiProperty({ type: String, nullable: true })
  public previousStatus!: string | null;

  @ApiProperty({ type: String, nullable: true })
  public nextStatus!: string | null;

  @ApiProperty({ type: 'string', enum: ['CUSTOMER', 'ADMIN', 'SYSTEM'] })
  public actor!: string;

  @ApiProperty({ type: String, nullable: true })
  public reason!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;
}

export class ReviewEventsResponse {
  @ApiProperty({ type: [ReviewEventResponse] })
  public events!: ReviewEventResponse[];
}

export function toPublicReviewResponse(record: ReviewRecord): PublicReviewResponse {
  return {
    id: record.id,
    productId: record.productId,
    rating: record.rating,
    title: record.title,
    body: record.body,
    verifiedPurchase: record.verifiedPurchase,
    createdAt: record.createdAt.toISOString(),
  };
}

export function toReviewResponse(record: ReviewRecord): ReviewResponse {
  return {
    id: record.id,
    productId: record.productId,
    status: record.status,
    rating: record.rating,
    title: record.title,
    body: record.body,
    verifiedPurchase: record.verifiedPurchase,
    orderId: record.orderId,
    moderatedByUserId: record.moderatedByUserId,
    moderatedAt: record.moderatedAt === null ? null : record.moderatedAt.toISOString(),
    moderationReason: record.moderationReason,
    createdAt: record.createdAt.toISOString(),
  };
}

export function toReviewsResponse(records: readonly ReviewRecord[]): ReviewsResponse {
  return { reviews: records.map(toReviewResponse) };
}

export function toPublicReviewsResponse(records: readonly ReviewRecord[]): PublicReviewsResponse {
  return { reviews: records.map(toPublicReviewResponse) };
}

export function toReviewEventResponse(record: ReviewEventRecord): ReviewEventResponse {
  return {
    eventType: record.eventType,
    previousStatus: record.previousStatus,
    nextStatus: record.nextStatus,
    actor: record.actor,
    reason: record.reason,
    createdAt: record.createdAt.toISOString(),
  };
}

export function toReviewEventsResponse(
  records: readonly ReviewEventRecord[],
): ReviewEventsResponse {
  return { events: records.map(toReviewEventResponse) };
}
