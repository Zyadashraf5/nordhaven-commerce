'use client';

import Link from 'next/link';
import { useContext } from 'react';
import { Icon } from '../ui/Icon';
import { StorefrontImage } from '../ui/StorefrontImage';
import { formatMoney } from '../../data/money';
import type { ProductDimensions, StorefrontProduct } from '../../data/types';
import { ProductVariantContext } from './ProductDetailShell';
import { averageRating, usePublishedReviews } from '../f04/ProductReviewsPage';
import styles from './ProductDetail.module.css';

/**
 * The lower half of the product page (board-07 desktop, board-08 narrow):
 * About/Specifications/Care/Box, the dimension diagram, the empty reviews
 * panel and "Goes well with". Rendered inside `ProductDetailShell` so the
 * "Selected" specification row follows the picked variant.
 *
 * On the wide layout the first two blocks read as straight copy with an "h2";
 * on the narrow layout they become 56px accordion rows, per the board.
 */
export function ProductDetailSections({
  product,
  goesWellWith,
}: {
  product: StorefrontProduct;
  goesWellWith: StorefrontProduct[];
}) {
  const variant = useContext(ProductVariantContext);

  return (
    <>
      {/* About + Specifications. `id=specs` is the picker's Dimensions anchor. */}
      <section id="specs" aria-label="Product details" className={styles.specsGrid}>
        <div className={styles.specsCol}>
          <h2 className={styles.sectionTitle}>About this {categoryNoun(product)}</h2>
          <div className={styles.accordion}>
            <details className={`${styles.accordionItem} ${styles.accordionLead}`} open>
              <summary className={styles.accordionSummary}>
                <span className={styles.accordionLabel}>About this {categoryNoun(product)}</span>
                <Icon
                  name="chevron-down"
                  size={16}
                  strokeWidth={2}
                  className={styles.accordionChevron}
                />
              </summary>
              <p className={styles.aboutBody}>{product.description}</p>
              {product.gallery?.[2] ? (
                <span className={styles.desktopControls}>
                  <StorefrontImage
                    image={product.gallery[2]}
                    alt=""
                    sizes="440px"
                    priority={false}
                    className={styles.aboutImage}
                  />
                </span>
              ) : null}
            </details>
            {product.care ? (
              <details className={styles.accordionItem}>
                <summary className={styles.accordionSummary}>
                  <span className={styles.accordionLabel}>Care</span>
                  <Icon
                    name="chevron-down"
                    size={16}
                    strokeWidth={2}
                    className={styles.accordionChevron}
                  />
                </summary>
                <ul className={styles.accordionBullets}>
                  {product.care.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </details>
            ) : null}
            {product.boxContents ? (
              <details className={styles.accordionItem}>
                <summary className={styles.accordionSummary}>
                  <span className={styles.accordionLabel}>What’s in the box</span>
                  <Icon
                    name="chevron-down"
                    size={16}
                    strokeWidth={2}
                    className={styles.accordionChevron}
                  />
                </summary>
                <ul className={styles.accordionBullets}>
                  {product.boxContents.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        </div>

        <div className={styles.specsCol}>
          <h2 className={styles.sectionTitle}>Specifications</h2>
          <div className={styles.accordion}>
            <details className={`${styles.accordionItem} ${styles.accordionLead}`} open>
              <summary className={styles.accordionSummary}>
                <span className={styles.accordionLabel}>Specifications</span>
                <Icon
                  name="chevron-down"
                  size={16}
                  strokeWidth={2}
                  className={styles.accordionChevron}
                />
              </summary>
              <dl className={styles.specTable}>
                {variant ? (
                  <div className={styles.specRow}>
                    <dt className={styles.specTerm}>Selected</dt>
                    <dd className={`${styles.specDetail} ${styles.specDetailStrong}`}>
                      {[variant.colour?.label, variant.size?.label].filter(Boolean).join(', ')}
                    </dd>
                  </div>
                ) : null}
                {product.specs?.map((spec) => (
                  <div key={spec.label} className={styles.specRow}>
                    <dt className={styles.specTerm}>{spec.label}</dt>
                    <dd className={styles.specDetail}>{spec.value}</dd>
                  </div>
                ))}
                <div className={styles.specRow}>
                  <dt className={styles.specTerm}>Brand</dt>
                  <dd className={styles.specDetail}>{product.brand.name}</dd>
                </div>
              </dl>
              {product.dimensions ? (
                <DimensionsFigure dimensions={product.dimensions} name={product.name} />
              ) : null}
            </details>
          </div>
        </div>
      </section>

      {/* Reviews — published (approved) reviews from the API (F06). */}
      <section aria-label="Reviews" className={styles.reviewsGrid}>
        <div className={styles.reviewsIntro}>
          <h2 id="reviewsHeading" className={styles.sectionTitle}>
            Reviews
          </h2>
          <p className={styles.reviewsBody}>
            Reviews come from verified buyers of this product and are checked before they appear.
            Nothing is removed or edited.
          </p>
        </div>
        <ReviewsCard slug={product.slug} />
      </section>

      {goesWellWith.length > 0 ? (
        <section aria-label="Goes well with" className={styles.section}>
          <div className={styles.goowellHeader}>
            <h2 className={styles.sectionTitle}>Goes well with</h2>
            <Link
              href={`/products?category=${product.category.slug}`}
              className={styles.goowellLink}
            >
              {`Shop ${product.category.name.toLowerCase()}`}
            </Link>
          </div>
          <div className={styles.goowellGrid}>
            {goesWellWith.map((related) => (
              <Link
                key={related.slug}
                href={`/products/${related.slug}`}
                className={styles.goowellCard}
              >
                <StorefrontImage
                  image={related.image}
                  alt={related.image.alt}
                  sizes="240px"
                  priority={false}
                  className={styles.goowellImage}
                />
                <span className={styles.goowellName}>{related.name}</span>
                <bdi>
                  <span
                    className={`${styles.goowellPrice} ${
                      related.previousPrice ? styles.goowellPriceOffer : ''
                    }`}
                  >
                    {formatMoney(related.price)}
                  </span>
                  {related.previousPrice ? (
                    <s className={styles.goowellWas}>{formatMoney(related.previousPrice)}</s>
                  ) : null}
                </bdi>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function categoryNoun(product: StorefrontProduct): string {
  const name = product.category.name.toLowerCase();
  return name.endsWith('s') ? name.slice(0, -1) : name;
}

function DimensionsFigure({ dimensions, name }: { dimensions: ProductDimensions; name: string }) {
  return (
    <figure className={styles.dimensions}>
      <svg
        className={styles.dimensionsSvg}
        viewBox="0 0 300 150"
        fill="none"
        stroke="var(--hw-text-muted)"
        strokeWidth="1.5"
        role="img"
        aria-label={`Diagram of the ${name.toLowerCase()} measurements`}
      >
        {/* the vessel body */}
        <path d="M92 52 C92 42 208 42 208 52 L202 112 C202 120 98 120 98 112 Z" />
        {/* the lid */}
        <path d="M92 52 C104 36 196 36 208 52" />
        <path d="M144 38 C144 30 156 30 156 38" />
        {/* height span */}
        <path d="M258 40 L258 120 M250 40 L266 40 M250 120 L266 120" />
        {/* width span */}
        <path d="M86 136 L214 136 M86 128 L86 144 M214 128 L214 144" />
        {/* base span */}
        <path d="M98 24 L202 24 M98 16 L98 32 M202 16 L202 32" />
      </svg>
      <figcaption className={styles.dimensionsCaption}>
        <span>{dimensions.heightCm} cm high with the lid</span>
        <span>{dimensions.widthCm} cm across the handles</span>
        <span>
          {dimensions.depthCm} cm across the base
          {dimensions.weightKg ? ` · ${dimensions.weightKg} kg` : ''}
        </span>
      </figcaption>
    </figure>
  );
}

/** The PDP reviews card: the published review count and average, or an honest empty state. */
function ReviewsCard({ slug }: { slug: string }) {
  const { state } = usePublishedReviews(slug);
  const reviews = state.status === 'ready' ? state.reviews : [];
  return (
    <div className={styles.reviewsCard}>
      {state.status === 'loading' ? (
        <span className={styles.reviewsBody}>Loading reviews…</span>
      ) : state.status === 'error' ? (
        <span className={styles.reviewsBody}>Reviews couldn’t be loaded right now.</span>
      ) : reviews.length === 0 ? (
        <>
          <span className={styles.reviewsTitle}>No reviews yet</span>
          <p className={styles.reviewsBody}>
            Be the first to write one once your order is paid. Reviews come from verified buyers,
            and are checked before they appear.
          </p>
          <Link href="/account/reviews" className={styles.reviewsLink}>
            Go to my reviews
          </Link>
        </>
      ) : (
        <>
          <span className={styles.reviewsTitle}>
            {averageRating(reviews)} out of 5 · {reviews.length} review
            {reviews.length === 1 ? '' : 's'}
          </span>
          <p className={styles.reviewsBody}>{reviews[0]?.title}</p>
          <Link href={`/reviews/${slug}`} className={styles.reviewsLink}>
            Read all reviews
          </Link>
        </>
      )}
    </div>
  );
}
