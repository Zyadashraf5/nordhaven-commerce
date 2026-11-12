'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '../../lib/api/browser';
import type { AdminProductSummary, AdminReview } from '../../lib/api/admin-types';
import { OrderStatusBadge } from '../f04/OrderStatusBadge';
import {
  AdminEmpty,
  AdminLoad,
  AdminNotice,
  adminDate,
  readAllPages,
  useAdminAction,
  useAdminLoader,
} from './admin-data';
import { Events } from './AdminReturnsPage';
import styles from '../admin/AdminLayout.module.css';

/**
 * Admin reviews (Stage 5 admin boards), live (F06): every review
 * (`GET /admin/reviews`) or the moderation queue, oldest first
 * (`GET /admin/reviews/pending`, on /admin/reviews/pending). A pending review
 * is approved or rejected with a reason (`POST …/decision`); the author is
 * notified by the backend. A review no longer pending can't be decided again.
 */
export function AdminReviewsPage() {
  const pendingOnly = (usePathname() ?? '').endsWith('/pending');
  const { state, reload } = useAdminLoader(async () => {
    const [reviews, pending, products] = await Promise.all([
      api.get<{ reviews: AdminReview[] }>(pendingOnly ? 'admin/reviews/pending' : 'admin/reviews'),
      api.get<{ reviews: AdminReview[] }>('admin/reviews/pending'),
      readAllPages<AdminProductSummary>('admin/catalog/products', 'items'),
    ]);
    return {
      reviews: reviews.reviews,
      pendingCount: pending.reviews.length,
      products: new Map(products.items.map((p) => [p.id, p.name])),
    };
  }, [pendingOnly]);
  const action = useAdminAction();

  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <h1 className={styles.sectionTitle}>{pendingOnly ? 'Pending reviews' : 'Reviews'}</h1>
        <p className={styles.sectionIntro}>
          {pendingOnly
            ? 'Reviews waiting for a decision, oldest first. The author is told the outcome.'
            : 'Customer reviews with their moderation status. Only approved reviews appear in the store.'}
        </p>
        <AdminNotice notice={action.notice} />
        <AdminLoad state={state} onRetry={() => void reload()} what="reviews">
          {({ reviews, pendingCount, products }) => (
            <>
              <div className={styles.actions} style={{ marginBottom: 16 }}>
                <Link
                  href={pendingOnly ? '/admin/reviews' : '/admin/reviews/pending'}
                  className={styles.btnOutline}
                  style={{ height: 36, padding: '0 12px', fontSize: 14 }}
                >
                  {pendingOnly ? 'All reviews' : `Pending reviews (${pendingCount})`}
                </Link>
              </div>
              {reviews.length === 0 ? (
                <AdminEmpty
                  icon="reviews"
                  title={pendingOnly ? 'Nothing waiting' : 'No reviews yet'}
                  body="Reviews appear when customers write them about products they bought."
                />
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Rating</th>
                        <th>Review</th>
                        <th>Status</th>
                        <th>Verified</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody data-rows>
                      {reviews.map((r) => (
                        <ReviewRow
                          key={r.id}
                          review={r}
                          product={products.get(r.productId) ?? 'Unknown product'}
                          action={action}
                          onSaved={() => void reload()}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </AdminLoad>
      </section>
    </div>
  );
}

function ReviewRow({
  review,
  product,
  action,
  onSaved,
}: {
  review: AdminReview;
  product: string;
  action: ReturnType<typeof useAdminAction>;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const decide = async (decision: 'APPROVED' | 'REJECTED') => {
    const done = await action.run(
      decision,
      () =>
        api.post(`admin/reviews/${review.id}/decision`, {
          decision,
          reason: reason.trim() || null,
        }),
      decision === 'APPROVED' ? 'Review approved.' : 'Review rejected.',
    );
    if (done !== null) onSaved();
  };
  return (
    <>
      <tr className={styles.tableRow}>
        <td className={styles.tableCell}>{product}</td>
        <td className={styles.tableCell}>
          <span className="numerals">{review.rating} of 5</span>
        </td>
        <td className={styles.tableCell}>
          <div style={{ fontWeight: 600 }}>{review.title}</div>
          <div style={{ fontSize: 13, color: 'var(--hw-text-secondary)' }}>{review.body}</div>
          <div style={{ fontSize: 12, color: 'var(--hw-text-muted)' }}>
            {adminDate(review.createdAt)}
          </div>
        </td>
        <td className={styles.tableCell}>
          <OrderStatusBadge kind="review" status={review.status} />
          {review.moderationReason !== null ? (
            <div style={{ fontSize: 12 }}>{review.moderationReason}</div>
          ) : null}
        </td>
        <td className={styles.tableCell}>{review.verifiedPurchase ? 'Yes' : 'No'}</td>
        <td className={styles.tableCell}>
          {review.status === 'PENDING' ? (
            <div className={styles.filterBar}>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor={`rv-${review.id}`}>
                  Reason
                </label>
                <input
                  id={`rv-${review.id}`}
                  className={styles.textField}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={action.busy !== null}
                onClick={() => void decide('APPROVED')}
              >
                Approve
              </button>
              <button
                type="button"
                className={styles.btnOutline}
                disabled={action.busy !== null || reason.trim() === ''}
                title={reason.trim() === '' ? 'Give a reason to reject' : undefined}
                onClick={() => void decide('REJECTED')}
              >
                Reject
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className={styles.btnOutline}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? 'Hide history' : 'History'}
          </button>
        </td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={6} className={styles.tableCell}>
            <Events path={`admin/reviews/${review.id}/events`} />
          </td>
        </tr>
      ) : null}
    </>
  );
}
