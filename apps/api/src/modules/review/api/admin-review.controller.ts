import { Body, Controller, Get, Header, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppError } from '../../../platform/http/app-error';
import { errors } from '../../../platform/http/openapi-error-responses';
import { CurrentPrincipal, Roles } from '../../../platform/security/access.decorators';
import type { AuthenticatedPrincipal } from '../../../platform/security/principal';
import { RateLimit } from '../../../platform/security/rate-limit.decorator';
import { ReviewService } from '../application/review.service';
import { REVIEW_RATE_LIMITS } from './review.policies';
import { ModerateReviewRequest, ReviewIdParam } from './review.request';
import {
  ReviewEventsResponse,
  ReviewResponse,
  ReviewsResponse,
  toReviewEventsResponse,
  toReviewResponse,
  toReviewsResponse,
} from './review.response';

/**
 * The administrative review surface.
 *
 * Every route requires the `ADMIN` role and every decision is attributable to the administrator who
 * made it. The surface **decides** reviews; it never edits a customer's words, because a review
 * that the platform publishes must be the customer's own statement.
 */
@ApiTags('Reviews')
@Roles('ADMIN')
@Controller({ path: 'admin/reviews', version: '1' })
export class AdminReviewController {
  public constructor(private readonly reviews: ReviewService) {}

  @Get()
  @RateLimit(REVIEW_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listAdminReviews',
    summary: 'List every review',
    description: 'Newest first. The moderation state of every review is reported.',
  })
  @ApiResponse({ status: 200, description: 'The reviews.', type: ReviewsResponse })
  @errors(400, 401, 403, 429, 500, 503)
  public async list(): Promise<ReviewsResponse> {
    return toReviewsResponse(await this.reviews.list(50));
  }

  @Get('pending')
  @RateLimit(REVIEW_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listAdminPendingReviews',
    summary: 'List the reviews that wait for a moderation decision',
    description: 'Oldest first, because the oldest review has waited the longest.',
  })
  @ApiResponse({
    status: 200,
    description: 'The reviews awaiting a decision.',
    type: ReviewsResponse,
  })
  @errors(400, 401, 403, 429, 500, 503)
  public async listPending(): Promise<ReviewsResponse> {
    return toReviewsResponse(await this.reviews.listPending(50));
  }

  @Get(':reviewId')
  @RateLimit(REVIEW_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'reviewId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'getAdminReview',
    summary: 'Read one review of any customer',
  })
  @ApiResponse({ status: 200, description: 'The review.', type: ReviewResponse })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async read(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: ReviewIdParam,
  ): Promise<ReviewResponse> {
    void principal;
    const review = await this.reviews.reviewOf(params.reviewId);
    if (review === null) throw AppError.reviewNotFound();
    return toReviewResponse(review);
  }

  @Post(':reviewId/decision')
  @HttpCode(200)
  @RateLimit(REVIEW_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'reviewId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'moderateAdminReview',
    summary: 'Approve or reject a held review',
    description:
      'The decision is recorded with its reason, and the author is notified through the Notifications capability. A decision on a review that is no longer held for moderation is refused and recorded.',
  })
  @ApiResponse({ status: 200, description: 'The moderated review.', type: ReviewResponse })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async moderate(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: ReviewIdParam,
    @Body() body: ModerateReviewRequest,
  ): Promise<ReviewResponse> {
    return toReviewResponse(
      await this.reviews.moderate({
        reviewId: params.reviewId,
        decision: body.decision,
        actorUserId: principal.userId,
        reason: body.reason,
      }),
    );
  }

  @Get(':reviewId/events')
  @RateLimit(REVIEW_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'reviewId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'listAdminReviewEvents',
    summary: 'List the recorded transitions of a review',
  })
  @ApiResponse({
    status: 200,
    description: 'The recorded transitions.',
    type: ReviewEventsResponse,
  })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async events(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: ReviewIdParam,
  ): Promise<ReviewEventsResponse> {
    void principal;
    const review = await this.reviews.reviewOf(params.reviewId);
    if (review === null) throw AppError.reviewNotFound();
    return toReviewEventsResponse(await this.reviews.eventsOf(params.reviewId));
  }
}
