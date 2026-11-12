'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '../../components/ui/Icon';
import { api, errorMessage } from '../../lib/api/browser';
import { OrderStatusBadge } from '../f04/OrderStatusBadge';
import styles from '../f04/f04.module.css';

interface Message {
  id: string;
  kind: string;
  subject: string;
  body: string;
  status: 'PENDING' | 'DELIVERED' | 'FAILED' | 'SKIPPED';
  provider: string | null;
  failureReason: string | null;
  createdAt: string;
}

/**
 * Notifications (boards: Notifications desktop / mobile / tablet), live (F06):
 * `GET /notifications` — what the store sent, or would have sent, the
 * customer. No delivery provider is approved yet (HC-DEC-014), so a message
 * is recorded rather than emailed; its delivery state says so. The contract
 * has no read/unread state and no preferences, so neither is offered.
 */
export function NotificationsPage() {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; items: Message[] }
  >({
    status: 'loading',
  });
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const { notifications } = await api.get<{ notifications: Message[] }>('notifications');
      setState({ status: 'ready', items: notifications });
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
            Notifications
          </h1>
          <p className={styles.subtitle}>
            Messages about your orders, reviews and returns. Email delivery isn’t switched on yet,
            so they’re kept here.
          </p>
        </div>
        <Link href="/account" className={styles.continueLink}>
          <Icon name="chevron-left" size={16} strokeWidth={2} aria-hidden="true" />
          Back to my account
        </Link>
      </div>

      {state.status === 'loading' ? (
        <p className={styles.fieldHelp} role="status">
          Loading your messages…
        </p>
      ) : state.status === 'error' ? (
        <div className={styles.errorState} role="alert">
          <Icon name="alert" size={36} strokeWidth={1.4} stroke="#a1362b" aria-hidden="true" />
          <h2 className={styles.errorTitle}>We couldn’t load your messages</h2>
          <p className={styles.errorBody}>{state.message}</p>
          <div className={styles.actions}>
            <button type="button" className={styles.btnPrimary} onClick={() => void load()}>
              Try again
            </button>
          </div>
        </div>
      ) : state.items.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>
            <Icon name="bell" size={24} strokeWidth={1.6} aria-hidden="true" />
          </span>
          <h2 className={styles.emptyTitle}>No notifications yet</h2>
          <p className={styles.emptyBody}>
            Messages about your orders, reviews and returns will appear here as they happen.
          </p>
          <div className={styles.actions}>
            <Link href="/account/orders" className={styles.btnOutline}>
              Go to my orders
            </Link>
          </div>
        </div>
      ) : (
        <ul className={styles.list} data-reveal-stagger>
          {state.items.map((n) => (
            <li key={n.id} className={styles.cardRow}>
              <div className={styles.cardBody}>
                <span className={styles.cardLabel}>{n.subject}</span>
                <span className={styles.cardLines}>{n.kind.replace(/_/g, ' ').toLowerCase()}</span>
                {open === n.id ? <span className={styles.fieldHelp}>{n.body}</span> : null}
                <span dir="ltr" className={styles.numerals}>
                  {new Date(n.createdAt).toLocaleString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <OrderStatusBadge kind="notification" status={n.status} />
              <button
                type="button"
                className={styles.btnOutline}
                style={{ height: 36, padding: '0 12px', fontSize: 14 }}
                aria-expanded={open === n.id}
                onClick={() => setOpen(open === n.id ? null : n.id)}
              >
                {open === n.id ? 'Hide' : 'Read'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
