import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { DatabaseService } from '../../../platform/database/database.service';
import type { ReviewEventRecord, ReviewRecord, ReviewStatusValue } from '../contracts';

const REVIEW_SELECT = {
  id: true,
  productId: true,
  customerId: true,
  orderId: true,
  rating: true,
  title: true,
  body: true,
  status: true,
  verifiedPurchase: true,
  moderatedByUserId: true,
  moderatedAt: true,
  moderationReason: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ReviewSelect;

const REVIEW_EVENT_SELECT = {
  id: true,
  reviewId: true,
  eventType: true,
  previousStatus: true,
  nextStatus: true,
  actor: true,
  actorUserId: true,
  reason: true,
  detail: true,
  createdAt: true,
} satisfies Prisma.ReviewEventSelect;

/** The attributes of a recorded review transition. */
export interface ReviewEventAttributes {
  readonly eventType: string;
  readonly previousStatus: ReviewStatusValue | null;
  readonly nextStatus: ReviewStatusValue | null;
  readonly actor: 'CUSTOMER' | 'ADMIN' | 'SYSTEM';
  readonly actorUserId: string | null;
  readonly reason: string | null;
  readonly detail?: Prisma.InputJsonValue | undefined;
}

/**
 * Persistence for the reviews.
 *
 * The concurrency guarantee lives here: every state change is a **conditional** update whose `WHERE`
 * clause states the state the review is in, so two concurrent moderation decisions cannot both
 * apply, and the transition and its event are written in one transaction.
 */
@Injectable()
export class ReviewRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async findById(id: string): Promise<ReviewRecord | null> {
    const row = await this.database.prisma.review.findUnique({
      where: { id },
      select: REVIEW_SELECT,
    });
    return row === null ? null : toRecord(row);
  }

  public async findForCustomerAndProduct(
    customerId: string,
    productId: string,
  ): Promise<ReviewRecord | null> {
    const row = await this.database.prisma.review.findUnique({
      where: { productId_customerId: { productId, customerId } },
      select: REVIEW_SELECT,
    });
    return row === null ? null : toRecord(row);
  }

  public async create(input: {
    readonly productId: string;
    readonly customerId: string;
    readonly orderId: string | null;
    readonly rating: number;
    readonly title: string;
    readonly body: string;
    readonly verifiedPurchase: boolean;
    readonly event: ReviewEventAttributes;
  }): Promise<ReviewRecord> {
    const row = await this.database.prisma.$transaction(async (transaction) => {
      const created = await transaction.review.create({
        data: {
          productId: input.productId,
          customerId: input.customerId,
          orderId: input.orderId,
          rating: input.rating,
          title: input.title,
          body: input.body,
          verifiedPurchase: input.verifiedPurchase,
          status: 'PENDING',
        },
        select: REVIEW_SELECT,
      });
      await transaction.reviewEvent.create({
        data: {
          reviewId: created.id,
          eventType: input.event.eventType,
          previousStatus: input.event.previousStatus,
          nextStatus: input.event.nextStatus,
          actor: input.event.actor,
          actorUserId: input.event.actorUserId,
          reason: input.event.reason,
          ...(input.event.detail === undefined ? {} : { detail: input.event.detail }),
        },
      });
      return created;
    });
    return toRecord(row);
  }

  /**
   * Edits a review that is still held for moderation.
   *
   * The update is conditional on the review's **current** state, so an approved or a rejected
   * review is immutable and a concurrent moderation cannot be overwritten.
   */
  public async editPending(input: {
    readonly reviewId: string;
    readonly rating: number;
    readonly title: string;
    readonly body: string;
    readonly event: ReviewEventAttributes;
  }): Promise<ReviewRecord | null> {
    const row = await this.database.prisma.$transaction(async (transaction) => {
      const updated = await transaction.review.updateMany({
        where: { id: input.reviewId, status: 'PENDING' },
        data: { rating: input.rating, title: input.title, body: input.body },
      });
      if (updated.count === 0) return null;
      await transaction.reviewEvent.create({
        data: {
          reviewId: input.reviewId,
          eventType: input.event.eventType,
          previousStatus: input.event.previousStatus,
          nextStatus: input.event.nextStatus,
          actor: input.event.actor,
          actorUserId: input.event.actorUserId,
          reason: input.event.reason,
          ...(input.event.detail === undefined ? {} : { detail: input.event.detail }),
        },
      });
      return transaction.review.findUnique({
        where: { id: input.reviewId },
        select: REVIEW_SELECT,
      });
    });
    return row === null ? null : toRecord(row);
  }

  /** Moves a review to a moderated state and records the transition, in one transaction. */
  public async moderate(
    reviewId: string,
    from: ReviewStatusValue,
    to: ReviewStatusValue,
    event: ReviewEventAttributes,
    changes: {
      readonly moderatedByUserId?: string | null | undefined;
      readonly moderatedAt?: Date | null | undefined;
      readonly moderationReason?: string | null | undefined;
    } = {},
  ): Promise<ReviewRecord | null> {
    const row = await this.database.prisma.$transaction(async (transaction) => {
      const updated = await transaction.review.updateMany({
        where: { id: reviewId, status: from },
        data: {
          status: to,
          ...(changes.moderatedByUserId === undefined
            ? {}
            : { moderatedByUserId: changes.moderatedByUserId }),
          ...(changes.moderatedAt === undefined ? {} : { moderatedAt: changes.moderatedAt }),
          ...(changes.moderationReason === undefined
            ? {}
            : { moderationReason: changes.moderationReason }),
        },
      });
      if (updated.count === 0) return null;
      await transaction.reviewEvent.create({
        data: {
          reviewId,
          eventType: event.eventType,
          previousStatus: event.previousStatus,
          nextStatus: event.nextStatus,
          actor: event.actor,
          actorUserId: event.actorUserId,
          reason: event.reason,
          ...(event.detail === undefined ? {} : { detail: event.detail }),
        },
      });
      return transaction.review.findUnique({
        where: { id: reviewId },
        select: REVIEW_SELECT,
      });
    });
    return row === null ? null : toRecord(row);
  }

  /** Records a review event without changing the review's state. */
  public async recordEvent(reviewId: string, event: ReviewEventAttributes): Promise<void> {
    await this.database.prisma.reviewEvent.create({
      data: {
        reviewId,
        eventType: event.eventType,
        previousStatus: event.previousStatus,
        nextStatus: event.nextStatus,
        actor: event.actor,
        actorUserId: event.actorUserId,
        reason: event.reason,
        ...(event.detail === undefined ? {} : { detail: event.detail }),
      },
    });
  }

  public async listApprovedForProduct(
    productId: string,
    limit: number,
  ): Promise<readonly ReviewRecord[]> {
    const rows = await this.database.prisma.review.findMany({
      where: { productId, status: 'APPROVED' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: REVIEW_SELECT,
    });
    return rows.map(toRecord);
  }

  public async listForCustomer(
    customerId: string,
    limit: number,
  ): Promise<readonly ReviewRecord[]> {
    const rows = await this.database.prisma.review.findMany({
      where: { customerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: REVIEW_SELECT,
    });
    return rows.map(toRecord);
  }

  public async list(limit: number): Promise<readonly ReviewRecord[]> {
    const rows = await this.database.prisma.review.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: REVIEW_SELECT,
    });
    return rows.map(toRecord);
  }

  public async listPending(limit: number): Promise<readonly ReviewRecord[]> {
    const rows = await this.database.prisma.review.findMany({
      where: { status: 'PENDING' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
      select: REVIEW_SELECT,
    });
    return rows.map(toRecord);
  }

  public async listEvents(reviewId: string): Promise<readonly ReviewEventRecord[]> {
    const rows = await this.database.prisma.reviewEvent.findMany({
      where: { reviewId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: REVIEW_EVENT_SELECT,
    });
    return rows.map((row) => ({
      id: row.id,
      reviewId: row.reviewId,
      eventType: row.eventType,
      previousStatus: row.previousStatus,
      nextStatus: row.nextStatus,
      actor: row.actor as 'CUSTOMER' | 'ADMIN' | 'SYSTEM',
      actorUserId: row.actorUserId,
      reason: row.reason,
      detail: row.detail,
      createdAt: row.createdAt,
    }));
  }
  public async stateCounts(): Promise<readonly { state: string; count: number }[]> {
    const rows = await this.database.prisma.review.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    return rows
      .map((row) => ({ state: row.status, count: row._count._all }))
      .sort((a, b) => a.state.localeCompare(b.state));
  }
  public async customerIdsAfter(cursor: string | null, limit: number): Promise<readonly string[]> {
    const rows = await this.database.prisma.review.groupBy({
      by: ['customerId'],
      where: cursor === null ? {} : { customerId: { gt: cursor } },
      orderBy: { customerId: 'asc' },
      take: limit,
    });
    return rows.map((row) => row.customerId);
  }
  public async customerCounts(
    ids: readonly string[],
  ): Promise<readonly { customerId: string; count: number }[]> {
    if (ids.length === 0) return [];
    const rows = await this.database.prisma.review.groupBy({
      by: ['customerId'],
      where: { customerId: { in: [...ids] } },
      _count: { _all: true },
    });
    return rows.map((row) => ({ customerId: row.customerId, count: row._count._all }));
  }
  public async recordIdsForCustomer(customerId: string, limit: number): Promise<readonly string[]> {
    const rows = await this.database.prisma.review.findMany({
      where: { customerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }
}

function toRecord(row: {
  id: string;
  productId: string;
  customerId: string;
  orderId: string | null;
  rating: number;
  title: string;
  body: string;
  status: string;
  verifiedPurchase: boolean;
  moderatedByUserId: string | null;
  moderatedAt: Date | null;
  moderationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ReviewRecord {
  return {
    id: row.id,
    productId: row.productId,
    customerId: row.customerId,
    orderId: row.orderId,
    rating: row.rating,
    title: row.title,
    body: row.body,
    status: row.status as ReviewStatusValue,
    verifiedPurchase: row.verifiedPurchase,
    moderatedByUserId: row.moderatedByUserId,
    moderatedAt: row.moderatedAt,
    moderationReason: row.moderationReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
