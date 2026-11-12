import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification';
import { OrderModule } from '../order';
import { AdminReviewController } from './api/admin-review.controller';
import { CustomerReviewController, PublicReviewController } from './api/review.controller';
import { ReviewService } from './application/review.service';
import { REVIEW_LIBRARY } from './contracts';
import { ReviewRepository } from './persistence/review.repository';

/**
 * Reviews module.
 *
 * Owns the customer review, its moderation state, and its moderation trail, and nothing else. It
 * decides whether a customer may review a product by asking the Orders capability which of the
 * customer's orders have been paid, and it tells the customer about the outcome through the
 * Notifications capability's published contract.
 *
 * Every review is **held for moderation** before it is published, so a review the platform has not
 * approved is not visible to anybody else.
 */
@Module({
  imports: [OrderModule, NotificationModule],
  controllers: [PublicReviewController, CustomerReviewController, AdminReviewController],
  providers: [
    ReviewRepository,
    ReviewService,
    { provide: REVIEW_LIBRARY, useExisting: ReviewService },
  ],
  exports: [REVIEW_LIBRARY],
})
export class ReviewModule {}
