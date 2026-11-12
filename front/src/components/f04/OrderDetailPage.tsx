'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useParams } from 'next/navigation';
import { Icon } from '../../components/ui/Icon';
import { StorefrontImage } from '../../components/ui/StorefrontImage';
import { formatMoney } from '../../data/money';
import type { AccountLang } from '../../components/account/AccountAddresses';
import { api, errorMessage } from '../../lib/api/browser';
import type { ApiOrder, ApiPaymentAttempt, ApiPaymentList } from '../../lib/api/commerce-types';
import {
  canCancelOrder,
  orderItemCount,
  orderReference,
  placedDate,
  variantLabel,
} from '../../lib/commerce-mapper';
import { useProductsById } from '../../lib/use-products-by-id';
import { OrderStatusBadge } from '../f04/OrderStatusBadge';
import { OrderTimeline } from '../f04/OrderTimeline';
import styles from '../f04/f04.module.css';

/* Arabic copy for the order-detail RTL preview (boards: Order detail mobile
 * Arabic RTL). Direction + fonts are applied on the page root; Western numerals are
 * used for phone/postal/SKU per the demo guidelines. */
const AR_COPY = {
  order: 'طلب',
  back: 'العودة إلى طلباتي',
  progress: 'تقدم الطلب',
  items: 'العناصر',
  summary: 'ملخص الطلب',
  payment: 'الدفع',
  shipment: 'الشحنة',
  cancelOrder: 'إلغاء الطلب',
  heldFor: 'عناصرك محجوزة حتى',
  viewCart: 'عرض سلة المشتريات',
} as const;

const egp = (amountMinor: number) => formatMoney({ amountMinor, currency: 'EGP' });
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

interface Shipment {
  id: string;
  orderId: string;
  status: 'PREPARED' | 'PACKED' | 'HANDED_OVER' | 'DELIVERED' | 'CANCELLED';
  methodLabel: string;
  trackingReference: string | null;
  carrierCode: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
}

const SHIPMENT_STATUS: Record<Shipment['status'], string> = {
  PREPARED: 'Being prepared',
  PACKED: 'Packed',
  HANDED_OVER: 'Handed to the courier',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

/**
 * Order detail (boards: Orders order detail, Order detail mobile Arabic RTL,
 * Shipment tracking) on the real order (F06: `GET /orders/{id}`), its payment
 * attempts (`GET /payments`) and shipments (`GET /shipments`).
 *
 * Paying starts a payment attempt for this order (`POST /payments/attempts`,
 * idempotent per attempt). The attempt's state is shown exactly as the
 * backend reports it; a pending attempt is never presented as paid.
 * Cancelling is offered only while the order awaits payment (the contract
 * refuses it for paid orders) and releases the held stock.
 */
export function OrderDetailPage() {
  const { orderId } = useParams();
  const searchParams = useSearchParams();
  const lang: AccountLang = (searchParams.get('lang') ?? 'en') === 'ar' ? 'ar' : 'en';
  const ar = lang === 'ar';
  const id = typeof orderId === 'string' ? orderId : '';

  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'missing' }
    | { status: 'error'; message: string }
    | { status: 'loaded'; order: ApiOrder; attempts: ApiPaymentAttempt[]; shipments: Shipment[] }
  >({ status: 'loading' });
  const [busy, setBusy] = useState<'pay' | 'cancel' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const order = await api.get<ApiOrder>(`orders/${encodeURIComponent(id)}`);
      const [payments, shipments] = await Promise.all([
        api.get<ApiPaymentList>('payments').catch(() => ({ attempts: [] })),
        api.get<{ shipments: Shipment[] }>('shipments').catch(() => ({ shipments: [] })),
      ]);
      setState({
        status: 'loaded',
        order,
        attempts: payments.attempts.filter((attempt) => attempt.orderId === order.id),
        shipments: shipments.shipments.filter((shipment) => shipment.orderId === order.id),
      });
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 404 || status === 400) setState({ status: 'missing' });
      else setState({ status: 'error', message: errorMessage(error, 'Please try again.') });
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const order = state.status === 'loaded' ? state.order : null;
  const products = useProductsById(order?.lines.map((line) => line.productId) ?? []);

  const header = (title: string) => (
    <div className={styles.headRow}>
      <div className={styles.headTitles}>
        <h1 className={`${styles.headline} ${ar ? styles.headlineAr : ''}`}>{title}</h1>
        {order !== null ? (
          <p className={styles.subtitle}>
            Placed {placedDate(order.createdAt)} · {orderItemCount(order)}{' '}
            {orderItemCount(order) === 1 ? 'item' : 'items'}
          </p>
        ) : null}
      </div>
      <Link href="/account/orders" className={styles.continueLink}>
        <Icon name="chevron-left" size={16} strokeWidth={2} aria-hidden="true" />
        {ar ? AR_COPY.back : 'Back to my orders'}
      </Link>
    </div>
  );

  if (state.status === 'loading') {
    return (
      <div className={styles.page} dir={ar ? 'rtl' : 'ltr'}>
        {header('Order')}
        <p className={styles.fieldHelp} role="status">
          Loading your order…
        </p>
      </div>
    );
  }

  if (state.status === 'missing' || state.status === 'error') {
    const missing = state.status === 'missing';
    return (
      <div className={styles.page} dir={ar ? 'rtl' : 'ltr'}>
        {header('Order')}
        <div className={styles.emptyState} role="alert">
          <Icon name="alert" size={36} strokeWidth={1.4} stroke="#a1362b" aria-hidden="true" />
          <h2 className={styles.errorTitle}>
            {missing ? 'We couldn’t find that order' : 'We couldn’t load this order'}
          </h2>
          <p className={styles.errorBody}>
            {missing
              ? 'Check the order number in your confirmation, or show all orders.'
              : `${state.message} Your order is safe.`}
          </p>
          <div className={styles.actions}>
            {missing ? null : (
              <button type="button" className={styles.btnPrimary} onClick={() => void load()}>
                Try again
              </button>
            )}
            <Link
              href="/account/orders"
              className={missing ? styles.btnPrimary : styles.btnOutline}
            >
              Show all orders
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { attempts, shipments } = state;
  const loaded = state.order;
  const reference = orderReference(loaded);
  const latest = attempts[0] ?? null;
  const pending = loaded.status === 'PENDING_PAYMENT';
  const holdOpen = pending && new Date(loaded.expiresAt) > new Date();
  const canPay = holdOpen && latest?.status !== 'PENDING' && latest?.status !== 'SUCCEEDED';
  const cancellable = canCancelOrder(loaded);
  const inclusive = loaded.lines.length > 0 && loaded.lines.every((line) => line.taxInclusive);

  const startPayment = async () => {
    if (busy !== null) return;
    setBusy('pay');
    setActionError(null);
    try {
      // One key per attempt number: a double tap returns the same attempt.
      await api.post<ApiPaymentAttempt>(
        'payments/attempts',
        { orderId: loaded.id },
        { idempotencyKey: `order-${loaded.id}-attempt-${attempts.length + 1}` },
      );
      await load();
    } catch (error) {
      setActionError(errorMessage(error, 'We couldn’t start the payment. Nothing was charged.'));
    } finally {
      setBusy(null);
    }
  };

  const cancelOrder = async () => {
    if (busy !== null) return;
    setBusy('cancel');
    setActionError(null);
    try {
      await api.delete<ApiOrder>(`orders/${loaded.id}`);
      setCancelOpen(false);
      await load();
    } catch (error) {
      setCancelOpen(false);
      setActionError(errorMessage(error, 'We couldn’t cancel this order. It’s unchanged.'));
    } finally {
      setBusy(null);
    }
  };

  const steps = [
    { label: 'Placed', date: placedDate(loaded.createdAt), done: true, active: false },
    {
      label: 'Paid',
      date: loaded.paidAt !== null ? placedDate(loaded.paidAt) : '',
      done: loaded.paidAt !== null,
      active: pending,
    },
    {
      label: 'Fulfilled',
      date: '',
      done: loaded.status === 'FULFILLED',
      active: loaded.status === 'PAID' || loaded.status === 'PAID_PENDING_ALLOCATION',
    },
  ];
  if (loaded.status === 'CANCELLED' || loaded.status === 'EXPIRED') {
    steps.push({
      label: loaded.status === 'CANCELLED' ? 'Cancelled' : 'Expired',
      date: placedDate(loaded.cancelledAt ?? loaded.updatedAt),
      done: true,
      active: false,
    });
  }

  return (
    <div className={styles.page} dir={ar ? 'rtl' : 'ltr'} lang={ar ? 'ar' : 'en'}>
      {header(ar ? `${AR_COPY.order} ${reference}` : `Order ${reference}`)}

      <section className={styles.section}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <OrderStatusBadge kind="order" status={loaded.status} />
          <span className="numerals">{egp(loaded.totalMinor)}</span>
        </div>
        {holdOpen ? (
          <p className={styles.fieldHelp}>
            <strong>
              {ar ? AR_COPY.heldFor : 'Your items are held until'} {time(loaded.expiresAt)}
            </strong>{' '}
            — pay before then, or the order expires and the items are released.
          </p>
        ) : null}
        {pending && !holdOpen ? (
          <p className={styles.fieldHelp}>The payment window has closed; this order will expire.</p>
        ) : null}
        {loaded.status === 'CANCELLED' ? (
          <p className={styles.fieldHelp}>
            This order was cancelled and its items were released. Nothing was charged.
          </p>
        ) : null}
        {loaded.status === 'EXPIRED' ? (
          <p className={styles.fieldHelp}>
            This order wasn’t paid in time, so it expired and its items were released. Nothing was
            charged.
          </p>
        ) : null}

        {actionError !== null ? (
          <div className={styles.demoAlert} role="alert">
            <Icon name="alert" size={16} strokeWidth={1.8} stroke="#a1362b" aria-hidden="true" />
            <div>{actionError}</div>
          </div>
        ) : null}

        <h2 className={styles.sectionTitle}>{ar ? AR_COPY.progress : 'Order progress'}</h2>
        <OrderTimeline steps={steps} />

        <h2 className={styles.sectionTitle}>
          {ar ? AR_COPY.items : 'Items'} ({orderItemCount(loaded)})
        </h2>
        <ul className={styles.list} data-reveal-stagger>
          {loaded.lines.map((line) => {
            const product = products.get(line.productId);
            return (
              <li key={line.id} className={styles.cardRow}>
                {product !== undefined ? (
                  <span className={styles.cardImage}>
                    <StorefrontImage image={product.image} alt="" fill sizes="56px" />
                  </span>
                ) : null}
                <div className={styles.cardBody}>
                  <span className={styles.cardLabel}>{line.productName}</span>
                  <span className={styles.cardLines}>{variantLabel(product, line.sku)}</span>
                  <span className="numerals">SKU {line.sku}</span>
                </div>
                <div style={{ marginInlineStart: 'auto', textAlign: 'end' }}>
                  <span className={styles.amount} style={{ display: 'block' }}>
                    {egp(line.totalMinor)}
                  </span>
                  <span className={styles.fieldHelp}>
                    {line.quantity} × {egp(line.unitPriceMinor)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        <h2 className={styles.sectionTitle}>{ar ? AR_COPY.summary : 'Order summary'}</h2>
        <dl
          className={styles.summaryList}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: '8px 24px',
            fontSize: 14,
            lineHeight: 1.5,
            color: 'var(--hw-text-secondary)',
          }}
        >
          <dt>Subtotal before tax</dt>
          <dd className="numerals">{egp(loaded.subtotalMinor)}</dd>
          <dt>Tax{inclusive ? ' (included in prices)' : ''}</dt>
          <dd className="numerals">{egp(loaded.taxTotalMinor)}</dd>
          <dt>Delivery</dt>
          <dd>Not charged online</dd>
          <dt style={{ fontWeight: 700, color: 'var(--hw-text-primary)' }}>
            {loaded.paidAt !== null ? 'Total paid' : 'Total'}
          </dt>
          <dd
            className="numerals"
            style={{ fontWeight: 700, color: 'var(--hw-text-primary)', fontSize: 18 }}
          >
            {egp(loaded.totalMinor)}
          </dd>
          {loaded.refundedMinor > 0 ? (
            <>
              <dt>Refunded</dt>
              <dd className="numerals">{egp(loaded.refundedMinor)}</dd>
            </>
          ) : null}
        </dl>

        <h2 className={styles.sectionTitle}>{ar ? AR_COPY.payment : 'Payment'}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 }}>
          {latest === null ? (
            <span className={styles.cardLines}>
              {pending
                ? 'Not paid yet.'
                : loaded.paidAt !== null
                  ? 'Paid.'
                  : 'No payment was taken.'}
            </span>
          ) : (
            <>
              <span className={styles.cardLabel}>
                {latest.provider === 'LOCAL_TEST' ? 'Test payment' : latest.provider} ·{' '}
                {latest.status === 'PENDING'
                  ? 'Pending'
                  : latest.status === 'SUCCEEDED'
                    ? 'Succeeded'
                    : latest.status === 'FAILED'
                      ? 'Failed'
                      : latest.status === 'CANCELLED'
                        ? 'Cancelled'
                        : 'Refunded'}{' '}
                · <span className="numerals">{egp(latest.amountMinor)}</span>
              </span>
              {latest.status === 'PENDING' ? (
                <span className={styles.fieldHelp}>
                  {latest.provider === 'LOCAL_TEST'
                    ? 'This is the store’s non-production test provider: no real money moves. The order is marked paid only when the provider confirms the payment to the store — not from this page.'
                    : 'Waiting for the payment provider to confirm. This page shows the result once it does.'}
                </span>
              ) : null}
              {latest.status === 'FAILED' ? (
                <span className={styles.fieldHelp}>
                  The payment didn’t go through. No money was taken.
                </span>
              ) : null}
            </>
          )}
          {canPay ? (
            <div className={styles.actions} style={{ marginTop: 8 }}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => void startPayment()}
                disabled={busy !== null}
                aria-busy={busy === 'pay'}
              >
                {busy === 'pay'
                  ? 'Starting payment…'
                  : latest === null
                    ? 'Pay now'
                    : 'Try paying again'}
              </button>
            </div>
          ) : null}
        </div>

        <h2 className={styles.sectionTitle}>{ar ? AR_COPY.shipment : 'Delivery'}</h2>
        <p className={styles.fieldHelp}>
          Destination: <span className="numerals">{loaded.destinationCountryCode}</span>
        </p>
        {shipments.length === 0 ? (
          <p className={styles.fieldHelp}>
            Shipment details appear here once your order is prepared for delivery. No delivery date
            is promised before then.
          </p>
        ) : (
          shipments.map((shipment) => (
            <div
              key={shipment.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px 24px',
                fontSize: 14,
                lineHeight: 1.5,
                color: 'var(--hw-text-secondary)',
              }}
            >
              <span>Status</span>
              <span>{SHIPMENT_STATUS[shipment.status]}</span>
              <span>Method</span>
              <span>{shipment.methodLabel}</span>
              <span>Tracking number</span>
              <span>
                {shipment.trackingReference !== null ? (
                  <span dir="ltr" className={styles.numerals}>
                    {shipment.trackingReference}
                  </span>
                ) : (
                  'Not available yet'
                )}
              </span>
            </div>
          ))
        )}
      </section>

      <div style={{ marginTop: 20 }}>
        <p className={styles.fieldHelp}>
          Need help with this order? Quote <strong className="numerals">{reference}</strong>.
        </p>
        <div className={styles.actions}>
          <Link href="/cart" className={styles.btnOutline}>
            {ar ? AR_COPY.viewCart : 'View cart'}
          </Link>
          {cancellable ? (
            <button
              type="button"
              className={styles.btnOutline}
              onClick={() => setCancelOpen(true)}
              disabled={busy !== null}
            >
              {ar ? AR_COPY.cancelOrder : 'Cancel order'}
            </button>
          ) : (
            <span className={styles.fieldHelp}>
              {loaded.status === 'PAID' ||
              loaded.status === 'PAID_PENDING_ALLOCATION' ||
              loaded.status === 'FULFILLED'
                ? 'A paid order can’t be cancelled here.'
                : 'This order can’t be cancelled.'}
            </span>
          )}
        </div>
      </div>

      {cancelOpen ? (
        <div className={styles.overlay}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cancel-title"
            aria-describedby="cancel-body"
            className={styles.dialog}
            style={{ maxWidth: 480 }}
          >
            <div className={styles.confirmBox}>
              <h2 id="cancel-title" className={styles.dialogTitle}>
                Cancel order {reference}?
              </h2>
              <p id="cancel-body" className={styles.confirmBoxLabel}>
                This order hasn’t been paid, so you can still cancel it. Here’s what happens:
              </p>
              <ul
                style={{
                  margin: '8px 0 0',
                  paddingInlineStart: 20,
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: 'var(--hw-text-secondary)',
                }}
              >
                <li>
                  {orderItemCount(loaded) === 1 ? (
                    'The item is cancelled and released back to stock.'
                  ) : (
                    <>
                      All <span className="numerals">{orderItemCount(loaded)}</span> items are
                      cancelled together and released back to stock.
                    </>
                  )}
                </li>
                <li>No payment has been taken.</li>
                <li>This can’t be undone. You can place a new order any time.</li>
              </ul>
              <div className={styles.dialogFooter} style={{ paddingTop: 6 }}>
                <button
                  type="button"
                  className={styles.btnOutline}
                  onClick={() => setCancelOpen(false)}
                  disabled={busy !== null}
                >
                  Keep order
                </button>
                <button
                  type="button"
                  className={styles.btnDanger}
                  onClick={() => void cancelOrder()}
                  disabled={busy !== null}
                  aria-busy={busy === 'cancel'}
                >
                  {busy === 'cancel' ? 'Cancelling…' : 'Cancel order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
