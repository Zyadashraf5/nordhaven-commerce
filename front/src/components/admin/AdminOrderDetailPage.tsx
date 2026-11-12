'use client';

import { fire } from '../../lib/fire';
import { useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '../../components/ui/Icon';
import { formatMoney } from '../../data/money';
import { api, newIdempotencyKey } from '../../lib/api/browser';
import type {
  AdminOrder,
  AdminPaymentAttempt,
  AdminRefund,
  AdminShipment,
  AdminShippingMethod,
  AdminTransition,
} from '../../lib/api/admin-types';
import { OrderStatusBadge } from '../f04/OrderStatusBadge';
import {
  AdminLoad,
  AdminNotice,
  adminDate,
  parseMinor,
  shortId,
  useAdminAction,
  useAdminLoader,
  useAdminResource,
} from './admin-data';
import { loadOrderOwners } from './admin-customers';
import styles from '../admin/AdminLayout.module.css';

/**
 * Admin order detail (Stage 5 admin boards), live (F06):
 * - the order snapshot: `GET /admin/orders/{id}` (read-only by contract — there is no admin
 *   cancel; customers cancel unpaid orders, unpaid orders expire);
 * - payment attempts `GET /admin/payments` and their refunds; a refund of a succeeded payment
 *   goes through `POST /admin/payments/refunds` with one Idempotency-Key per refund intent;
 * - the shipment: `POST /admin/shipments` (only for a paid order, one per order), transitions
 *   `PATCH /admin/shipments/{id}`, the admin's own tracking text `PUT …/tracking`, events.
 * The order stores only the destination country (no delivery address) — a contract gap.
 */

interface Data {
  order: AdminOrder;
  owner: { customerId: string; email: string | null } | undefined;
  attempts: AdminPaymentAttempt[];
  shipment: AdminShipment | undefined;
  methods: AdminShippingMethod[];
}

const money = (amountMinor: number) => formatMoney({ amountMinor, currency: 'EGP' });

const NEXT: Record<AdminShipment['status'], AdminShipment['status'][]> = {
  PREPARED: ['PACKED', 'CANCELLED'],
  PACKED: ['HANDED_OVER', 'CANCELLED'],
  HANDED_OVER: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};
const STEP_LABEL: Record<AdminShipment['status'], string> = {
  PREPARED: 'Prepared',
  PACKED: 'Mark packed',
  HANDED_OVER: 'Mark handed to courier',
  DELIVERED: 'Mark delivered',
  CANCELLED: 'Cancel shipment',
};

export function AdminOrderDetailPage() {
  const { orderId } = useParams();
  const id = typeof orderId === 'string' ? orderId : '';
  const { state, reload } = useAdminLoader<Data>(async () => {
    const order = await api.get<AdminOrder>(`admin/orders/${encodeURIComponent(id)}`);
    const [owners, payments, shipments, methods] = await Promise.all([
      loadOrderOwners(),
      api.get<{ attempts: AdminPaymentAttempt[] }>('admin/payments'),
      api.get<{ shipments: AdminShipment[] }>('admin/shipments'),
      api.get<{ methods: AdminShippingMethod[] }>('admin/shipping/methods'),
    ]);
    return {
      order,
      owner: owners.get(order.id),
      attempts: payments.attempts.filter((a) => a.orderId === order.id),
      shipment: shipments.shipments.find((s) => s.orderId === order.id),
      methods: methods.methods,
    };
  }, [id]);

  return (
    <div className={styles.page}>
      <AdminLoad state={state} onRetry={() => void reload()} what="this order">
        {(data) => <OrderBody data={data} onChanged={() => void reload()} />}
      </AdminLoad>
      <div className={styles.actions}>
        <Link href="/admin/orders" className={styles.btnOutline}>
          Back to orders
        </Link>
      </div>
    </div>
  );
}

function OrderBody({ data, onChanged }: { data: Data; onChanged: () => void }) {
  const { order } = data;
  const items = order.lines.reduce((sum, line) => sum + line.quantity, 0);
  const paid =
    order.status === 'PAID' ||
    order.status === 'PAID_PENDING_ALLOCATION' ||
    order.status === 'FULFILLED';
  return (
    <>
      <section className={styles.section}>
        <div className={styles.statRow}>
          <h1 className={styles.sectionTitle}>Order {shortId(order.id, 'HC-')}</h1>
          <OrderStatusBadge kind="order" status={order.status} />
          <span className={`numerals ${styles.statRowTotal}`}>{money(order.totalMinor)}</span>
        </div>
        <p className={styles.fieldHelp}>
          Placed {adminDate(order.createdAt)} · {items} item{items === 1 ? '' : 's'} ·{' '}
          {data.owner?.email ?? 'customer not found'}
          {order.status === 'PENDING_PAYMENT'
            ? ` · payment window until ${adminDate(order.expiresAt)}`
            : ''}
          {order.statusReason !== null
            ? ` · ${order.statusReason.replace(/_/g, ' ').toLowerCase()}`
            : ''}
        </p>

        <div className={styles.summaryGrid}>
          <div>
            <h2 className={styles.subsectionTitle}>Delivery</h2>
            <p className={styles.fieldHelp}>Destination country: {order.destinationCountryCode}</p>
            <p className={styles.fieldHelp}>
              The order contract stores no delivery address or chosen shipping method.
            </p>
          </div>
          <div>
            <h2 className={styles.subsectionTitle}>Totals</h2>
            <p className={styles.fieldHelp}>
              Before tax {money(order.subtotalMinor)} · Tax {money(order.taxTotalMinor)} (
              {order.taxJurisdiction})
            </p>
            <p className={styles.fieldHelp}>
              Total {money(order.totalMinor)}
              {order.refundedMinor > 0 ? ` · refunded ${money(order.refundedMinor)}` : ''}
            </p>
          </div>
        </div>

        <h2 className={styles.subsectionTitle}>Items ({items})</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Item</th>
                <th className={styles.textRight}>Unit price</th>
                <th className={styles.textRight}>Qty</th>
                <th className={styles.textRight}>Tax</th>
                <th className={styles.textRight}>Line total</th>
              </tr>
            </thead>
            <tbody data-rows>
              {order.lines.map((line) => (
                <tr key={line.id} className={styles.tableRow}>
                  <td className={styles.tableCell}>
                    <div className={styles.lineItem}>
                      <div className={styles.lineItemImage}>
                        <Icon name="package" size={14} strokeWidth={1.6} aria-hidden="true" />
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{line.productName}</div>
                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--hw-text-muted)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          SKU {line.sku}
                          {line.discountBasisPoints > 0
                            ? ` · −${line.discountBasisPoints / 100}%`
                            : ''}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className={`${styles.tableCell} ${styles.textRight}`}>
                    <span className="numerals">{money(line.unitPriceMinor)}</span>
                  </td>
                  <td className={`${styles.tableCell} ${styles.textRight}`}>
                    <span className="numerals">{line.quantity}</span>
                  </td>
                  <td className={`${styles.tableCell} ${styles.textRight}`}>
                    <span className="numerals">{money(line.taxMinor)}</span>
                  </td>
                  <td className={`${styles.tableCell} ${styles.textRight}`}>
                    <span className="numerals">{money(line.totalMinor)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Payments attempts={data.attempts} onChanged={onChanged} />
      <Shipment data={data} paid={paid} onChanged={onChanged} />

      <p className={styles.fieldHelp}>
        There is no admin cancel in the API: a customer cancels an unpaid order, and an unpaid order
        expires at the end of its payment window.
      </p>
    </>
  );
}

function Payments({
  attempts,
  onChanged,
}: {
  attempts: AdminPaymentAttempt[];
  onChanged: () => void;
}) {
  return (
    <section className={styles.section}>
      <h2 className={styles.subsectionTitle}>Payment</h2>
      {attempts.length === 0 ? (
        <p className={styles.fieldHelp}>No payment has been started for this order.</p>
      ) : (
        attempts.map((attempt) => (
          <AttemptRow key={attempt.id} attempt={attempt} onChanged={onChanged} />
        ))
      )}
    </section>
  );
}

function AttemptRow({
  attempt,
  onChanged,
}: {
  attempt: AdminPaymentAttempt;
  onChanged: () => void;
}) {
  const refunds = useAdminResource<{ refunds: AdminRefund[] }>(
    `admin/payments/attempts/${attempt.id}/refunds`,
  );
  const action = useAdminAction();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  // One key per refund intent: a double click or a retry returns the same refund.
  const key = useRef<{ amount: number; key: string } | null>(null);
  const refundable = attempt.amountMinor - attempt.refundedMinor - attempt.pendingRefundMinor;
  const amountMinor = parseMinor(amount);

  return (
    <div style={{ marginBottom: 12 }}>
      <p className={styles.fieldHelp}>
        <strong>
          {attempt.provider === 'LOCAL_TEST'
            ? 'Test payment (non-production provider)'
            : attempt.provider}
        </strong>{' '}
        · {attempt.status.toLowerCase()} · {money(attempt.amountMinor)} · started{' '}
        {adminDate(attempt.createdAt)}
        {attempt.refundedMinor > 0 ? ` · refunded ${money(attempt.refundedMinor)}` : ''}
        {attempt.pendingRefundMinor > 0
          ? ` · refund pending ${money(attempt.pendingRefundMinor)}`
          : ''}
      </p>
      {attempt.status === 'PENDING' ? (
        <p className={styles.fieldHelp}>
          Pending until the provider confirms it. Nothing in the storefront or admin marks a payment
          as paid.
        </p>
      ) : null}
      <AdminLoad state={refunds.state} onRetry={() => void refunds.reload()} what="refunds">
        {({ refunds: list }) =>
          list.length === 0 ? null : (
            <ul className={styles.fieldHelp}>
              {list.map((refund) => (
                <li key={refund.id}>
                  Refund {money(refund.amountMinor)} · {refund.status.toLowerCase()} ·{' '}
                  {adminDate(refund.createdAt)}
                  {refund.reason !== null ? ` · ${refund.reason}` : ''}
                </li>
              ))}
            </ul>
          )
        }
      </AdminLoad>
      <AdminNotice notice={action.notice} />
      {attempt.status === 'SUCCEEDED' && refundable > 0 ? (
        <form
          className={styles.filterBar}
          noValidate
          onSubmit={fire(async (event) => {
            event.preventDefault();
            if (amountMinor === null || amountMinor <= 0 || amountMinor > refundable) return;
            if (key.current?.amount !== amountMinor)
              key.current = { amount: amountMinor, key: newIdempotencyKey() };
            const done = await action.run(
              'refund',
              () =>
                api.post(
                  'admin/payments/refunds',
                  {
                    paymentAttemptId: attempt.id,
                    amountMinor,
                    reason: reason.trim() === '' ? null : reason.trim(),
                  },
                  { idempotencyKey: key.current!.key },
                ),
              `Refund of ${money(amountMinor)} requested.`,
            );
            if (done !== null) {
              key.current = null;
              setAmount('');
              setReason('');
              onChanged();
            }
          })}
        >
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={`rf-${attempt.id}`}>
              Refund amount (up to {money(refundable)})
            </label>
            <input
              id={`rf-${attempt.id}`}
              className={styles.textField}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={`rr-${attempt.id}`}>
              Reason
            </label>
            <input
              id={`rr-${attempt.id}`}
              className={styles.textField}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className={styles.btnPrimary}
            disabled={
              action.busy !== null ||
              amountMinor === null ||
              amountMinor <= 0 ||
              amountMinor > refundable
            }
          >
            {action.busy === 'refund' ? 'Refunding…' : 'Refund'}
          </button>
        </form>
      ) : null}
    </div>
  );
}

function Shipment({ data, paid, onChanged }: { data: Data; paid: boolean; onChanged: () => void }) {
  const action = useAdminAction();
  const { shipment } = data;
  const methods = useMemo(
    () =>
      data.methods.filter(
        (m) =>
          m.active &&
          (m.destinationCountryCode === null ||
            m.destinationCountryCode === data.order.destinationCountryCode),
      ),
    [data.methods, data.order.destinationCountryCode],
  );
  const [methodCode, setMethodCode] = useState(methods[0]?.code ?? '');
  const [tracking, setTracking] = useState(shipment?.trackingReference ?? '');

  return (
    <section className={styles.section}>
      <h2 className={styles.subsectionTitle}>Shipment</h2>
      <AdminNotice notice={action.notice} />
      {shipment === undefined ? (
        paid ? (
          <form
            className={styles.filterBar}
            noValidate
            onSubmit={fire(async (event) => {
              event.preventDefault();
              if (methodCode === '') return;
              const done = await action.run(
                'create',
                () => api.post('admin/shipments', { orderId: data.order.id, methodCode }),
                'Shipment created.',
              );
              if (done !== null) onChanged();
            })}
          >
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="ship-method">
                Shipping method
              </label>
              <select
                id="ship-method"
                className={styles.textField}
                value={methodCode}
                onChange={(e) => setMethodCode(e.target.value)}
              >
                {methods.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.label} · {money(m.amountMinor)}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className={styles.btnPrimary}
              disabled={action.busy !== null || methodCode === ''}
            >
              {action.busy === 'create' ? 'Creating…' : 'Create shipment'}
            </button>
          </form>
        ) : (
          <p className={styles.fieldHelp}>
            No shipment. A shipment can only be created once the order is paid (one per order).
          </p>
        )
      ) : (
        <div className={styles.summaryGrid}>
          <div>
            <p className={styles.fieldHelp}>
              <span style={{ fontWeight: 600 }}>Status:</span>{' '}
              <OrderStatusBadge kind="shipment" status={shipment.status} />
            </p>
            <p className={styles.fieldHelp}>
              <span style={{ fontWeight: 600 }}>Method:</span> {shipment.methodLabel} ·{' '}
              {money(shipment.amountMinor)}
            </p>
            <p className={styles.fieldHelp}>
              <span style={{ fontWeight: 600 }}>Destination:</span> {shipment.destinationLabel}
            </p>
            <div className={styles.actions}>
              {NEXT[shipment.status].map((to) => (
                <button
                  key={to}
                  type="button"
                  className={to === 'CANCELLED' ? styles.btnOutline : styles.btnPrimary}
                  disabled={action.busy !== null}
                  onClick={fire(async () => {
                    const done = await action.run(
                      to,
                      () => api.patch(`admin/shipments/${shipment.id}`, { to, reason: null }),
                      'Shipment updated.',
                    );
                    if (done !== null) onChanged();
                  })}
                >
                  {STEP_LABEL[to]}
                </button>
              ))}
            </div>
            <form
              className={styles.filterBar}
              noValidate
              onSubmit={fire(async (event) => {
                event.preventDefault();
                if (tracking.trim() === '') return;
                const done = await action.run(
                  'tracking',
                  () =>
                    api.put(`admin/shipments/${shipment.id}/tracking`, {
                      trackingReference: tracking.trim(),
                    }),
                  'Tracking reference saved (your own text — no carrier is contacted).',
                );
                if (done !== null) onChanged();
              })}
            >
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="ship-track">
                  Tracking reference
                </label>
                <input
                  id="ship-track"
                  className={styles.textField}
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className={styles.btnOutline}
                disabled={
                  action.busy !== null ||
                  tracking.trim() === '' ||
                  tracking.trim() === shipment.trackingReference
                }
              >
                Save tracking
              </button>
            </form>
          </div>
          <div>
            <p className={styles.fieldHelp}>Events:</p>
            <ShipmentEvents id={shipment.id} />
          </div>
        </div>
      )}
    </section>
  );
}

function ShipmentEvents({ id }: { id: string }) {
  const { state, reload } = useAdminResource<{ events: AdminTransition[] }>(
    `admin/shipments/${id}/events`,
  );
  return (
    <AdminLoad state={state} onRetry={() => void reload()} what="events">
      {({ events }) => (
        <ol className={styles.timeline}>
          {events.map((event, index) => (
            <li key={index} className={styles.timelineRow}>
              <span className={styles.timelineDot} />
              <div>
                <div style={{ fontWeight: 600 }}>
                  {(event.nextStatus ?? event.eventType).replace(/_/g, ' ').toLowerCase()} ·{' '}
                  {event.actor.toLowerCase()}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--hw-text-secondary)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {adminDate(event.createdAt)}
                  {event.reason !== null ? ` · ${event.reason}` : ''}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </AdminLoad>
  );
}
