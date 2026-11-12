'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '../../components/ui/Icon';
import { api, errorMessage } from '../../lib/api/browser';
import type { ApiOrderList } from '../../lib/api/commerce-types';
import { OrderStatusBadge } from '../f04/OrderStatusBadge';
import styles from '../f04/f04.module.css';

interface MyReview {
  id: string;
  productId: string;
  orderId: string | null;
  rating: number;
  title: string;
  body: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  moderationReason: string | null;
  verifiedPurchase: boolean;
  createdAt: string;
}

interface Reviewable {
  productId: string;
  productName: string;
}

/**
 * My reviews (boards: Reviews — My reviews tab), live (F06):
 * - ready to review: products from the customer's paid orders that have no review yet
 *   (the backend refuses a review without a paid order containing the product, and a
 *   second review of the same product);
 * - my reviews: `GET /reviews` with their moderation state; a pending review can be edited
 *   (`PATCH /reviews/{id}`), a published or refused one can't.
 * A new review is held for moderation (`POST /reviews`) — nothing is published here.
 */
export function MyReviewsPage() {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; mine: MyReview[]; ready: Reviewable[]; names: Map<string, string> }
  >({ status: 'loading' });
  const [editing, setEditing] = useState<{ productId: string; reviewId: string | null } | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      const [mine, orders] = await Promise.all([
        api.get<{ reviews: MyReview[] }>('reviews'),
        api.get<ApiOrderList>('orders'),
      ]);
      const names = new Map<string, string>();
      for (const order of orders.orders)
        for (const line of order.lines) names.set(line.productId, line.productName);
      const reviewed = new Set(mine.reviews.map((r) => r.productId));
      const paid = orders.orders.filter(
        (o) =>
          o.status === 'PAID' || o.status === 'PAID_PENDING_ALLOCATION' || o.status === 'FULFILLED',
      );
      const ready = [
        ...new Map(
          paid
            .flatMap((o) => o.lines)
            .map((l) => [l.productId, { productId: l.productId, productName: l.productName }]),
        ).values(),
      ].filter((item) => !reviewed.has(item.productId));
      setState({ status: 'ready', mine: mine.reviews, ready, names });
    } catch (error) {
      setState({ status: 'error', message: errorMessage(error, 'Please try again.') });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={styles.page}>
      <div className={styles.headRow}>
        <div className={styles.headTitles}>
          <h1 className={styles.headline} data-intro data-split="words">
            My reviews
          </h1>
          <p className={styles.subtitle}>
            You can review products from paid orders. Every review is checked before it appears on
            the product page.
          </p>
        </div>
        <Link href="/account" className={styles.continueLink}>
          <Icon name="chevron-left" size={16} strokeWidth={2} aria-hidden="true" />
          Back to my account
        </Link>
      </div>

      {state.status === 'loading' ? (
        <p className={styles.fieldHelp} role="status">
          Loading your reviews…
        </p>
      ) : state.status === 'error' ? (
        <div className={styles.errorState} role="alert">
          <h2 className={styles.errorTitle}>We couldn’t load your reviews</h2>
          <p className={styles.errorBody}>{state.message}</p>
          <div className={styles.actions}>
            <button type="button" className={styles.btnPrimary} onClick={() => void load()}>
              Try again
            </button>
          </div>
        </div>
      ) : (
        <>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              Ready to review <span className={styles.tabCount}>{state.ready.length}</span>
            </h2>
            {state.ready.length === 0 ? (
              <p className={styles.fieldHelp}>Products appear here once an order is paid.</p>
            ) : (
              <ul className={styles.list} data-reveal-stagger>
                {state.ready.map((item) => (
                  <li key={item.productId} className={styles.cardRow}>
                    <div className={styles.cardBody}>
                      <span className={styles.cardLabel}>{item.productName}</span>
                    </div>
                    <div style={{ marginInlineStart: 'auto' }}>
                      <button
                        type="button"
                        className={styles.btnPrimary}
                        onClick={() => setEditing({ productId: item.productId, reviewId: null })}
                      >
                        Write a review
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {editing !== null ? (
            <ReviewForm
              productName={state.names.get(editing.productId) ?? 'this product'}
              existing={state.mine.find((r) => r.id === editing.reviewId) ?? null}
              productId={editing.productId}
              onClose={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                void load();
              }}
            />
          ) : null}

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              Your reviews <span className={styles.tabCount}>{state.mine.length}</span>
            </h2>
            {state.mine.length === 0 ? (
              <p className={styles.fieldHelp}>You haven’t written a review yet.</p>
            ) : (
              <ul className={styles.list} data-reveal-stagger>
                {state.mine.map((r) => (
                  <li key={r.id} className={styles.cardRow}>
                    <div className={styles.cardBody}>
                      <span className={styles.cardLabel}>{r.title}</span>
                      <span className={styles.cardLines}>
                        {state.names.get(r.productId) ?? 'Product'} · {r.rating} of 5
                      </span>
                      <span className={styles.fieldHelp}>{r.body}</span>
                      {r.moderationReason !== null ? (
                        <span className={styles.fieldHelp}>Moderator: {r.moderationReason}</span>
                      ) : null}
                    </div>
                    <OrderStatusBadge kind="review" status={r.status} />
                    {r.status === 'PENDING' ? (
                      <button
                        type="button"
                        className={styles.btnOutline}
                        onClick={() => setEditing({ productId: r.productId, reviewId: r.id })}
                      >
                        Edit
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function ReviewForm({
  productId,
  productName,
  existing,
  onClose,
  onSaved,
}: {
  productId: string;
  productName: string;
  existing: MyReview | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rating, setRating] = useState(existing?.rating ?? 5);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const submit = async () => {
    if (title.trim() === '' || body.trim() === '')
      return setError('Add a title and a few words about the product.');
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const payload = { rating, title: title.trim(), body: body.trim() };
      if (existing === null) await api.post('reviews', { productId, ...payload });
      else await api.patch(`reviews/${existing.id}`, payload);
      onSaved();
    } catch (failure) {
      setError(errorMessage(failure, 'We couldn’t save your review.'));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>
        {existing === null ? 'Review' : 'Edit your review of'} {productName}
      </h2>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="rv-rating">
          Rating
        </label>
        <select
          id="rv-rating"
          className={styles.textField}
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
        >
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} of 5
            </option>
          ))}
        </select>
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="rv-title">
          Title
        </label>
        <input
          id="rv-title"
          className={styles.textField}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="rv-body">
          Your review
        </label>
        <textarea
          id="rv-body"
          className={styles.textField}
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      {error !== null ? (
        <p className={styles.fieldHelp} role="alert">
          {error}
        </p>
      ) : null}
      <p className={styles.fieldHelp}>Your review is checked before it appears.</p>
      <div className={styles.actions}>
        <button type="button" className={styles.btnOutline} onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={() => void submit()}
          disabled={busy}
        >
          {busy ? 'Sending…' : existing === null ? 'Send for review' : 'Save changes'}
        </button>
      </div>
    </section>
  );
}
