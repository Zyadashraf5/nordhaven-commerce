'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { OrderStatusBadge } from '../f04/OrderStatusBadge';
import { Icon } from '../ui/Icon';
import { RequireSession } from '../auth/RequireSession';
import { formatMoney } from '../../data/money';
import { api, errorMessage } from '../../lib/api/browser';
import type { ApiOrder } from '../../lib/api/commerce-types';
import { orderItemCount, orderReference } from '../../lib/commerce-mapper';
import styles from '../../app/order-confirmation/page.module.css';

/**
 * Order confirmation (Stage 3 confirmation board) for the order just placed
 * (F06: `GET /orders/{id}`, id from `?order=`). It says what is true: the
 * order exists and is awaiting payment (or whatever the backend reports), the
 * items are held until the payment window closes, and nothing is paid until
 * the provider confirms it. It never claims a payment was received.
 */
const egp = (amountMinor: number) => formatMoney({ amountMinor, currency: 'EGP' });
const at = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function OrderConfirmation() {
  return (
    <RequireSession>
      <Confirmation />
    </RequireSession>
  );
}

function Confirmation() {
  const id = useSearchParams().get('order') ?? '';
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string; missing: boolean }
    | { status: 'ready'; order: ApiOrder }
  >({ status: 'loading' });

  const load = useCallback(async () => {
    if (id === '') {
      setState({ status: 'error', message: 'No order was given.', missing: true });
      return;
    }
    setState({ status: 'loading' });
    try {
      setState({
        status: 'ready',
        order: await api.get<ApiOrder>(`orders/${encodeURIComponent(id)}`),
      });
    } catch (error) {
      const status = (error as { status?: number }).status;
      setState({
        status: 'error',
        message: errorMessage(error, 'We couldn’t load your order.'),
        missing: status === 404 || status === 400,
      });
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === 'loading') {
    return (
      <div className={styles.page}>
        <p className={styles.intro} role="status">
          Loading your order…
        </p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className={styles.page} role="alert">
        <h1 className={styles.headline}>
          {state.missing ? 'We couldn’t find that order' : 'We couldn’t load your order'}
        </h1>
        <p className={styles.intro}>
          {state.missing
            ? 'Your orders are listed in your account.'
            : `${state.message} Your order is safe.`}
        </p>
        <div className={styles.actions}>
          {state.missing ? null : (
            <button type="button" className={styles.btnPrimary} onClick={() => void load()}>
              Try again
            </button>
          )}
          <Link
            href="/account/orders"
            className={state.missing ? styles.btnPrimary : styles.btnOutline}
          >
            View your orders
          </Link>
        </div>
      </div>
    );
  }

  const { order } = state;
  const awaiting = order.status === 'PENDING_PAYMENT';
  const count = orderItemCount(order);
  const inclusive = order.lines.length > 0 && order.lines.every((line) => line.taxInclusive);
  const steps = [
    { title: 'Order placed', body: 'You’ll find it in your account under Orders.', state: 'done' },
    awaiting
      ? {
          title: 'Pay for your order',
          body: `Your items are held until ${at(order.expiresAt)}. Pay from the order page before then.`,
          state: 'next',
        }
      : { title: 'Payment', body: 'See the order page for the payment status.', state: 'next' },
    {
      title: 'We pack and ship it',
      body: 'Delivery details appear on the order page once it ships.',
      state: 'later',
    },
  ] as const;

  return (
    <div className={styles.page}>
      <span className={styles.doneMark} aria-hidden="true">
        <Icon name="check" size={22} strokeWidth={2.2} />
      </span>
      <h1 className={styles.headline} data-intro data-split="words">
        Thank you — your order is placed
      </h1>
      <p className={styles.intro}>
        {awaiting
          ? 'It’s waiting for payment. Nothing has been charged yet.'
          : 'Here are your order details.'}
      </p>

      <section className={styles.card} aria-label="Order number" data-reveal>
        <span className={styles.label}>Order number</span>
        <div className={styles.orderRow}>
          <span className={`numerals ${styles.orderNo}`}>{orderReference(order)}</span>
          <OrderStatusBadge kind="order" status={order.status} />
        </div>
        <span className={styles.meta}>
          Placed {day(order.createdAt)} · Total{' '}
          <strong className="numerals">{egp(order.totalMinor)}</strong>
        </span>
      </section>

      <section className={styles.next} aria-labelledby="oc-next">
        <h2 id="oc-next" className={styles.sectionTitle}>
          What happens next
        </h2>
        <ol className={styles.steps} data-reveal-stagger>
          {steps.map((step, index) => (
            <li key={step.title} className={styles.step}>
              <span className={`${styles.stepNum} ${styles[`step_${step.state}`]}`}>
                {step.state === 'done' ? (
                  <Icon name="check" size={13} strokeWidth={2.4} aria-hidden="true" />
                ) : (
                  index + 1
                )}
              </span>
              <span className={styles.stepText}>
                <strong>{step.title}</strong>
                <span>{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <div className={styles.actions}>
        <Link href={`/account/orders/${order.id}`} className={styles.btnPrimary}>
          {awaiting ? 'View order and pay' : 'View order'}
        </Link>
        <Link href="/products" className={styles.btnOutline}>
          Continue shopping
        </Link>
      </div>

      <section className={styles.card} aria-labelledby="oc-summary" data-reveal>
        <h2 id="oc-summary" className={styles.cardTitle}>
          Order summary
        </h2>
        <dl className={styles.totals}>
          {order.lines.map((line) => (
            <div key={line.id}>
              <dt>
                {line.productName} · <span className="numerals">SKU {line.sku}</span> ×{' '}
                {line.quantity}
              </dt>
              <dd className="numerals">{egp(line.totalMinor)}</dd>
            </div>
          ))}
          <div>
            <dt>
              {count} {count === 1 ? 'item' : 'items'} before tax
            </dt>
            <dd className="numerals">{egp(order.subtotalMinor)}</dd>
          </div>
          <div>
            <dt>Tax{inclusive ? ' (included in prices)' : ''}</dt>
            <dd className="numerals">{egp(order.taxTotalMinor)}</dd>
          </div>
          <div className={styles.grand}>
            <dt>Total</dt>
            <dd className="numerals">{egp(order.totalMinor)}</dd>
          </div>
        </dl>
        <p className={styles.note}>Delivery isn’t charged online yet.</p>
      </section>
    </div>
  );
}
