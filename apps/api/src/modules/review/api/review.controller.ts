import { Body, Controller, Get, Header, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppError } from '../../../platform/http/app-error';
import { errors } from '../../../platform/http/openapi-error-responses';
import { Public } from '../../../platform/security/access.decorators';
import { CurrentPrincipal, Roles } from '../../../platform/security/access.decorators';
import type { AuthenticatedPrincipal } from '../../../platform/security/principal';
import { RateLimit } from '../../../platform/security/rate-limit.decorator';
import { ReviewService } from '../application/review.service';
import { REVIEW_RATE_LIMITS } from './review.policies';
import {
  CreateReviewRequest,
  EditReviewRequest,
  ProductReviewsQuery,
  ReviewIdParam,
} from './review.request';
import {
  PublicReviewsResponse,
  ReviewEventsResponse,
  ReviewResponse,
  ReviewsResponse,
  toPublicReviewsResponse,
  toReviewEventsResponse,
  toReviewResponse,
  toReviewsResponse,
} from './review.response';

/**
 * The published reviews of a product.
 *
 * The route is anonymous, because a product's reviews are storefront information, exactly as the
 * catalog's browsing routes are. Only **approved** reviews are visible, and a public review never
 * carries the author's identity.
 */
@ApiTags('Reviews')
@Public()
@Controller({ path: 'products', version: '1' })
export class PublicReviewController {
  public constructor(private readonly reviews: ReviewService) {}

  @Get('reviews')
  @RateLimit(REVIEW_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listPublicProductReviews',
    summary: "List a product's published reviews",
    description:
      'Only approved reviews are published. A review that is still held for moderation, and a review that was refused, are not visible.',
  })
  @ApiResponse({
    status: 200,
    description: "The product's published reviews.",
    type: PublicReviewsResponse,
  })
  @errors(400, 429, 500, 503)
  public async listProductReviews(
    @Query() query: ProductReviewsQuery,
  ): Promise<PublicReviewsResponse> {
    return toPublicReviewsResponse(await this.reviews.approvedReviewsOf(query.productId, 50));
  }
}

/**
 * The authenticated customer's own reviews.
 *
 * Every route is scoped to the presented session's principal, so no request can name or reach
 * another customer's review. A review that belongs to another customer is answered exactly like
 * one that never existed.
 */
@ApiTags('Reviews')
@Roles('CUSTOMER')
@Controller({ path: 'reviews', version: '1' })
export class CustomerReviewController {
  public constructor(private readonly reviews: ReviewService) {}

  @Get()
  @RateLimit(REVIEW_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listCustomerReviews',
    summary: "List the authenticated customer's reviews",
    description:
      'A review is held for moderation before it is published, so a review of the customer’s own is reported with its moderation state.',
  })
  @ApiResponse({ status: 200, description: "The customer's reviews.", type: ReviewsResponse })
  @errors(400, 401, 403, 429, 500, 503)
  public async list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<ReviewsResponse> {
    return toReviewsResponse(await this.reviews.listForCustomer(principal.userId, 50));
  }

  @Post()
  @RateLimit(REVIEW_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'createReview',
    summary: 'Review a product the customer has bought',
    description:
      'The review is refused unless the customer holds a paid order that contains the product, and a second review of the same product is refused. The review is held for moderation and is published only after an administrator approves it.',
  })
  @ApiResponse({ status: 201, description: 'The recorded review.', type: ReviewResponse })
  @errors(400, 401, 403, 409, 429, 500, 503)
  public async create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: CreateReviewRequest,
  ): Promise<ReviewResponse> {
    return toReviewResponse(
      await this.reviews.create({
        productId: body.productId,
        customerId: principal.userId,
        rating: body.rating,
        title: body.title,
        body: body.body,
      }),
    );
  }

  @Get(':reviewId')
  @RateLimit(REVIEW_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'reviewId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'getCustomerReview',
    summary: "Read one of the authenticated customer's reviews",
  })
  @ApiResponse({ status: 200, description: 'The review.', type: ReviewResponse })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async read(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: ReviewIdParam,
  ): Promise<ReviewResponse> {
    const review = await this.reviews.reviewOf(params.reviewId);
    if (review === null || review.customerId !== principal.userId) {
      throw AppError.reviewNotFound();
    }
    return toReviewResponse(review);
  }

  @Patch(':reviewId')
  @RateLimit(REVIEW_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'reviewId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'editCustomerReview',
    summary: 'Edit one of the customer own reviews while it is held for moderation',
    description:
      'A review that has already been published or refused is immutable, so a customer cannot rewrite what the platform has already decided.',
  })
  @ApiResponse({ status: 200, description: 'The edited review.', type: ReviewResponse })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async edit(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: ReviewIdParam,
    @Body() body: EditReviewRequest,
  ): Promise<ReviewResponse> {
    return toReviewResponse(
      await this.reviews.edit({
        reviewId: params.reviewId,
        customerId: principal.userId,
        rating: body.rating,
        title: body.title,
        body: body.body,
      }),
    );
  }

  @Get(':reviewId/events')
  @RateLimit(REVIEW_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'reviewId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'listCustomerReviewEvents',
    summary: "List the recorded transitions of one of the customer's reviews",
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
    const review = await this.reviews.reviewOf(params.reviewId);
    if (review === null || review.customerId !== principal.userId) {
      throw AppError.reviewNotFound();
    }
    return toReviewEventsResponse(await this.reviews.eventsOf(params.reviewId));
  }
}
