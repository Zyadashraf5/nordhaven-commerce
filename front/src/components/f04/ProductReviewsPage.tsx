'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '../../components/ui/Icon';
import { api, errorMessage } from '../../lib/api/browser';
import styles from '../f04/f04.module.css';

export interface PublishedReview {
  id: string;
  productId: string;
  rating: number;
  title: string;
  body: string;
  verifiedPurchase: boolean;
  createdAt: string;
}

/** Published (approved) reviews of one product, by slug: `GET /catalog/products/{slug}` → `GET /products/reviews?productId=`. */
export function usePublishedReviews(slug: string) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; productName: string; reviews: PublishedReview[] }
  >({ status: 'loading' });
  const load = useCallback(async () => {
    try {
      const product = await api.get<{ id: string; name: string }>(
        `catalog/products/${encodeURIComponent(slug)}`,
      );
      const { reviews } = await api.get<{ reviews: PublishedReview[] }>('products/reviews', {
        query: { productId: product.id },
      });
      setState({ status: 'ready', productName: product.name, reviews });
    } catch (error) {
      setState({ status: 'error', message: errorMessage(error, 'Please try again.') });
    }
  }, [slug]);
  useEffect(() => {
    void load();
  }, [load]);
  return { state, reload: load };
}

export const averageRating = (reviews: PublishedReview[]): string =>
  reviews.length === 0
    ? '–'
    : (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1);

/**
 * Product reviews (`/reviews/[slug]`, Stage 4 reviews boards), live (F06):
 * only reviews an administrator approved are published (`GET /products/reviews`).
 * Writing one needs a paid order containing the product, from My reviews.
 */
export function ProductReviewsPage() {
  const { slug: slugParam } = useParams();
  const slug = Array.isArray(slugParam) ? (slugParam[0] ?? '') : (slugParam ?? '');
  const { state, reload } = usePublishedReviews(slug);

  return (
    <div className={styles.page}>
      <div className={styles.headRow}>
        <div className={styles.headTitles}>
          <h1 className={styles.headline} data-intro data-split="words">
            Reviews
          </h1>
          <p className={styles.subtitle}>
            {state.status === 'ready' ? `${state.productName}. ` : ''}Reviews come from customers
            who bought this product and are checked before they appear.
          </p>
        </div>
        <Link href={`/products/${slug}`} className={styles.continueLink}>
          <Icon name="chevron-left" size={16} strokeWidth={2} aria-hidden="true" />
          Back to product
        </Link>
      </div>

      {state.status === 'loading' ? (
        <p className={styles.fieldHelp} role="status">
          Loading reviews…
        </p>
      ) : state.status === 'error' ? (
        <div className={styles.errorState} role="alert">
          <h2 className={styles.errorTitle}>We couldn’t load the reviews</h2>
          <p className={styles.errorBody}>{state.message}</p>
          <div className={styles.actions}>
            <button type="button" className={styles.btnPrimary} onClick={() => void reload()}>
              Try again
            </button>
          </div>
        </div>
      ) : (
        <section className={styles.section}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 34, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {averageRating(state.reviews)}
            </span>
            <span className={styles.fieldHelp}>out of 5</span>
            <span className={styles.fieldHelp}>
              based on {state.reviews.length} review{state.reviews.length === 1 ? '' : 's'}
            </span>
          </div>
          {state.reviews.length > 0 ? (
            <div style={{ display: 'flex', gap: 24, marginTop: 12, flexWrap: 'wrap' }}>
              {[5, 4, 3, 2, 1].map((stars) => {
                const count = state.reviews.filter((r) => Math.round(r.rating) === stars).length;
                return (
                  <div key={stars}>
                    <span className={styles.cardLabel}>{stars} stars</span>{' '}
                    <span className={styles.fieldHelp}>
                      {Math.round((count / state.reviews.length) * 100)}%
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
          {state.reviews.length === 0 ? (
            <div className={styles.emptyState}>
              <h2 className={styles.emptyTitle}>No reviews yet</h2>
              <p className={styles.emptyBody}>
                Be the first to write one after your order is paid.
              </p>
            </div>
          ) : (
            <ul className={styles.list} data-reveal-stagger>
              {state.reviews.map((r) => (
                <li key={r.id} className={styles.cardRow}>
                  <div className={styles.cardBody}>
                    <span className={styles.cardLabel}>{r.title}</span>
                    <span className="numerals">
                      {r.rating} of 5{r.verifiedPurchase ? ' · Verified buyer' : ''}
                    </span>
                    <span className={styles.fieldHelp}>{r.body}</span>
                    <span className={styles.fieldHelp}>
                      {new Date(r.createdAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className={styles.actions}>
            <Link href="/account/reviews" className={styles.btnOutline}>
              Write a review
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
