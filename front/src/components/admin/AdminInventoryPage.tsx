'use client';

import { fire } from '../../lib/fire';
import { useState } from 'react';
import { Icon } from '../../components/ui/Icon';
import { api } from '../../lib/api/browser';
import type {
  AdminInventoryItem,
  AdminMovement,
  AdminProduct,
  AdminProductSummary,
  AdminReservation,
} from '../../lib/api/admin-types';
import {
  AdminLoad,
  AdminNotice,
  adminDate,
  readAllPages,
  shortId,
  useAdminAction,
  useAdminLoader,
  useAdminResource,
} from './admin-data';
import styles from '../admin/AdminLayout.module.css';

/**
 * Admin inventory (Stage 5 admin boards), live (F06):
 * - balances: `GET /admin/inventory` (on hand, reserved, available per SKU or fixed bundle);
 * - stock count: `PUT /admin/inventory/variants/{variantId}` sets the on-hand quantity with a
 *   reason (refused below the reserved quantity); it also starts tracking an untracked SKU;
 * - movements: `GET /admin/inventory/{id}/movements` (append-only audit);
 * - reservations: `GET /admin/reservations`, release / extend an active hold.
 * Confirming a reservation is left to the payment flow (HC-DEC-004), so it isn't offered here.
 * There is no reorder point in the contract, so no "low stock" threshold is invented.
 */

const MOVEMENT_LABEL: Record<AdminMovement['reason'], string> = {
  ADJUSTMENT: 'Stock count',
  RESERVATION_CREATED: 'Held for an order',
  RESERVATION_RELEASED: 'Hold released',
  RESERVATION_EXPIRED: 'Hold expired',
  RESERVATION_CONFIRMED: 'Hold confirmed (sold)',
};

export function AdminInventoryPage() {
  const { state, reload } = useAdminLoader(
    () => readAllPages<AdminInventoryItem>('admin/inventory', 'items'),
    [],
  );
  const action = useAdminAction();
  const [adjust, setAdjust] = useState<{
    item: AdminInventoryItem;
    onHand: string;
    reason: string;
  } | null>(null);
  const [openMovements, setOpenMovements] = useState<string | null>(null);

  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <h1 className={styles.sectionTitle}>Inventory</h1>
        <p className={styles.sectionIntro}>
          Stock balances with on-hand, reserved (held for unpaid orders) and available quantities. A
          stock count sets the on-hand figure and is recorded as a movement.
        </p>
        <AdminNotice notice={action.notice} />

        <AdminLoad state={state} onRetry={() => void reload()} what="inventory">
          {({ items, complete }) => {
            const out = items.filter((item) => item.available === 0);
            return (
              <>
                {out.length > 0 ? (
                  <div className={styles.demoAlert} role="status">
                    <Icon
                      name="alert"
                      size={16}
                      strokeWidth={2}
                      stroke="#a1362b"
                      aria-hidden="true"
                    />
                    <div>
                      <strong>
                        {out.length} SKU{out.length === 1 ? '' : 's'} with nothing available:{' '}
                        {out.map((item) => item.sku ?? shortId(item.id)).join(', ')}
                      </strong>
                    </div>
                  </div>
                ) : null}
                {!complete ? (
                  <p className={styles.fieldHelp}>Showing the first 1,000 records; more exist.</p>
                ) : null}
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Product</th>
                        <th className={styles.textRight}>On hand</th>
                        <th className={styles.textRight}>Reserved</th>
                        <th className={styles.textRight}>Available</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody data-rows>
                      {items.map((item) => (
                        <InventoryRow
                          key={item.id}
                          item={item}
                          busy={action.busy}
                          adjusting={adjust?.item.id === item.id ? adjust : null}
                          onAdjust={() =>
                            setAdjust({ item, onHand: String(item.onHand), reason: '' })
                          }
                          onAdjustChange={(next) => setAdjust(next)}
                          onAdjustCancel={() => setAdjust(null)}
                          onAdjustSave={fire(async (onHand: number, reason: string) => {
                            const done = await action.run(
                              'adjust',
                              () =>
                                api.put(`admin/inventory/variants/${item.variantId}`, {
                                  onHand,
                                  reason: reason === '' ? null : reason,
                                }),
                              `${item.sku}: on hand set to ${onHand}.`,
                            );
                            if (done !== null) {
                              setAdjust(null);
                              void reload();
                            }
                          })}
                          movementsOpen={openMovements === item.id}
                          onToggleMovements={() =>
                            setOpenMovements(openMovements === item.id ? null : item.id)
                          }
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                <TrackSku tracked={items} action={action} onSaved={() => void reload()} />
              </>
            );
          }}
        </AdminLoad>
      </section>

      <Reservations />
    </div>
  );
}

function InventoryRow({
  item,
  busy,
  adjusting,
  onAdjust,
  onAdjustChange,
  onAdjustCancel,
  onAdjustSave,
  movementsOpen,
  onToggleMovements,
}: {
  item: AdminInventoryItem;
  busy: string | null;
  adjusting: { item: AdminInventoryItem; onHand: string; reason: string } | null;
  onAdjust: () => void;
  onAdjustChange: (next: { item: AdminInventoryItem; onHand: string; reason: string }) => void;
  onAdjustCancel: () => void;
  onAdjustSave: (onHand: number, reason: string) => void;
  movementsOpen: boolean;
  onToggleMovements: () => void;
}) {
  const value = adjusting === null ? NaN : Number(adjusting.onHand);
  const valid = adjusting !== null && /^\d+$/.test(adjusting.onHand) && value >= item.reserved;
  return (
    <>
      <tr className={styles.tableRow}>
        <td className={styles.tableCell}>
          <span className="numerals">
            {item.sku ?? (item.bundleId !== null ? `Bundle ${shortId(item.bundleId)}` : '—')}
          </span>
        </td>
        <td className={styles.tableCell}>
          {item.productName ?? (item.bundleId !== null ? 'Fixed bundle (finished goods)' : '—')}
        </td>
        <td className={`${styles.tableCell} ${styles.textRight}`}>
          <span className="numerals">{item.onHand}</span>
        </td>
        <td className={`${styles.tableCell} ${styles.textRight}`}>
          <span className="numerals">{item.reserved}</span>
        </td>
        <td className={`${styles.tableCell} ${styles.textRight}`}>
          <span className="numerals">{item.available}</span>
        </td>
        <td className={styles.tableCell}>
          {adjusting !== null ? (
            <form
              className={styles.filterBar}
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                if (valid) onAdjustSave(value, adjusting.reason.trim());
              }}
            >
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor={`oh-${item.id}`}>
                  Counted on hand
                </label>
                <input
                  id={`oh-${item.id}`}
                  className={styles.textField}
                  inputMode="numeric"
                  style={{ width: 90 }}
                  value={adjusting.onHand}
                  onChange={(e) => onAdjustChange({ ...adjusting, onHand: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor={`why-${item.id}`}>
                  Reason
                </label>
                <input
                  id={`why-${item.id}`}
                  className={styles.textField}
                  value={adjusting.reason}
                  onChange={(e) => onAdjustChange({ ...adjusting, reason: e.target.value })}
                />
              </div>
              {!valid ? (
                <span className={styles.fieldHelp}>
                  A whole number, at least {item.reserved} (reserved).
                </span>
              ) : null}
              <button
                type="submit"
                className={styles.btnPrimary}
                disabled={!valid || busy !== null}
              >
                {busy === 'adjust' ? 'Saving…' : 'Save count'}
              </button>
              <button type="button" className={styles.btnOutline} onClick={onAdjustCancel}>
                Cancel
              </button>
            </form>
          ) : (
            <>
              {item.variantId !== null ? (
                <button
                  type="button"
                  className={styles.btnOutline}
                  disabled={busy !== null}
                  onClick={onAdjust}
                >
                  Stock count
                </button>
              ) : null}{' '}
              <button
                type="button"
                className={styles.btnOutline}
                aria-expanded={movementsOpen}
                onClick={onToggleMovements}
              >
                Movements
              </button>
            </>
          )}
        </td>
      </tr>
      {movementsOpen ? (
        <tr>
          <td colSpan={6} className={styles.tableCell}>
            <Movements inventoryId={item.id} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Movements({ inventoryId }: { inventoryId: string }) {
  const { state, reload } = useAdminResource<{ items: AdminMovement[] }>(
    `admin/inventory/${inventoryId}/movements`,
    { limit: 20 },
  );
  return (
    <AdminLoad state={state} onRetry={() => void reload()} what="movements">
      {({ items }) =>
        items.length === 0 ? (
          <p className={styles.fieldHelp}>No movements recorded.</p>
        ) : (
          <ol className={styles.timeline}>
            {items.map((m) => (
              <li key={m.id} className={styles.timelineRow}>
                <span className={styles.timelineDot} />
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {MOVEMENT_LABEL[m.reason]} · on hand {m.onHandDelta >= 0 ? '+' : ''}
                    {m.onHandDelta} → {m.onHandAfter} · reserved {m.reservedDelta >= 0 ? '+' : ''}
                    {m.reservedDelta} → {m.reservedAfter}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--hw-text-secondary)' }}>
                    {adminDate(m.createdAt)}
                    {m.note !== null ? ` · ${m.note}` : ''}
                    {m.reservationId !== null ? ` · hold ${shortId(m.reservationId)}` : ''}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )
      }
    </AdminLoad>
  );
}

/** Start tracking a SKU that has no stock record yet (PUT is an idempotent upsert). */
function TrackSku({
  tracked,
  action,
  onSaved,
}: {
  tracked: AdminInventoryItem[];
  action: ReturnType<typeof useAdminAction>;
  onSaved: () => void;
}) {
  const [candidates, setCandidates] = useState<{ variantId: string; label: string }[] | null>(null);
  const [variantId, setVariantId] = useState('');
  const [onHand, setOnHand] = useState('0');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { items } = await readAllPages<AdminProductSummary>('admin/catalog/products', 'items');
      const details = await Promise.all(
        items.map((p) => api.get<AdminProduct>(`admin/catalog/products/${p.id}`)),
      );
      const known = new Set(tracked.map((item) => item.variantId));
      setCandidates(
        details.flatMap((product) =>
          product.variants
            .filter((v) => !known.has(v.id))
            .map((v) => ({ variantId: v.id, label: `${v.sku} · ${product.name}` })),
        ),
      );
    } catch {
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.subsectionTitle}>Untracked SKUs</h2>
      {candidates === null ? (
        <button
          type="button"
          className={styles.btnOutline}
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? 'Looking for untracked SKUs…' : 'Find SKUs without a stock record'}
        </button>
      ) : candidates.length === 0 ? (
        <p className={styles.fieldHelp}>Every SKU has a stock record.</p>
      ) : (
        <form
          className={styles.filterBar}
          noValidate
          onSubmit={fire(async (event) => {
            event.preventDefault();
            if (variantId === '' || !/^\d+$/.test(onHand)) return;
            const done = await action.run(
              'track',
              () =>
                api.put(`admin/inventory/variants/${variantId}`, {
                  onHand: Number(onHand),
                  reason: 'Initial stock count',
                }),
              'Stock record created.',
            );
            if (done !== null) {
              setCandidates(null);
              setVariantId('');
              onSaved();
            }
          })}
        >
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="track-sku">
              SKU
            </label>
            <select
              id="track-sku"
              className={styles.textField}
              value={variantId}
              onChange={(e) => setVariantId(e.target.value)}
            >
              <option value="">Choose a SKU</option>
              {candidates.map((c) => (
                <option key={c.variantId} value={c.variantId}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="track-qty">
              On hand
            </label>
            <input
              id="track-qty"
              className={styles.textField}
              inputMode="numeric"
              value={onHand}
              onChange={(e) => setOnHand(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className={styles.btnPrimary}
            disabled={action.busy !== null || variantId === '' || !/^\d+$/.test(onHand)}
          >
            Start tracking
          </button>
        </form>
      )}
    </section>
  );
}

function Reservations() {
  const [status, setStatus] = useState<'ACTIVE' | 'CONFIRMED' | 'RELEASED' | 'EXPIRED' | ''>(
    'ACTIVE',
  );
  const { state, reload } = useAdminResource<{ items: AdminReservation[] }>(
    'admin/reservations',
    status === '' ? { limit: 50 } : { status, limit: 50 },
  );
  const action = useAdminAction();
  const [releasing, setReleasing] = useState<string | null>(null);

  return (
    <section className={styles.section}>
      <h2 className={styles.subsectionTitle}>Reservations (stock holds)</h2>
      <p className={styles.fieldHelp}>
        A hold is created when a customer places an order and lasts for the payment window; it ends
        when the order is cancelled, expires or is paid. Manual holds can be extended or released
        here.
      </p>
      <AdminNotice notice={action.notice} />
      <div className={styles.filterChip}>
        <label className={styles.fieldLabel} htmlFor="res-status">
          Status
        </label>
        <select
          id="res-status"
          className={styles.textField}
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
        >
          <option value="ACTIVE">Active</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="RELEASED">Released</option>
          <option value="EXPIRED">Expired</option>
          <option value="">All</option>
        </select>
      </div>
      <AdminLoad state={state} onRetry={() => void reload()} what="reservations">
        {({ items }) =>
          items.length === 0 ? (
            <p className={styles.fieldHelp}>No reservations in this state.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Hold</th>
                    <th>Lines</th>
                    <th>Status</th>
                    <th>Expires</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody data-rows>
                  {items.map((r) => (
                    <tr key={r.id} className={styles.tableRow}>
                      <td className={styles.tableCell}>
                        <span className="numerals">{shortId(r.id)}</span>
                        <div style={{ fontSize: 12, color: 'var(--hw-text-secondary)' }}>
                          {r.idempotencyKey.startsWith('order:') ? 'Order hold' : 'Manual hold'}
                        </div>
                      </td>
                      <td className={styles.tableCell}>
                        {r.lines.map((line) => (
                          <div key={line.id} className="numerals">
                            {line.sku ?? 'bundle'} × {line.quantity}
                          </div>
                        ))}
                      </td>
                      <td className={styles.tableCell}>
                        {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                      </td>
                      <td className={styles.tableCell}>{adminDate(r.expiresAt)}</td>
                      <td className={styles.tableCell}>
                        {r.status === 'ACTIVE' && r.idempotencyKey.startsWith('order:') ? (
                          <span className={styles.fieldHelp}>
                            Managed by its order (cancel or payment window)
                          </span>
                        ) : r.status === 'ACTIVE' ? (
                          releasing === r.id ? (
                            <>
                              <button
                                type="button"
                                className={styles.btnPrimary}
                                disabled={action.busy !== null}
                                onClick={fire(async () => {
                                  const done = await action.run(
                                    'release',
                                    () => api.post(`admin/reservations/${r.id}/release`),
                                    'Hold released; its stock is available again.',
                                  );
                                  setReleasing(null);
                                  if (done !== null) void reload();
                                })}
                              >
                                Confirm release
                              </button>{' '}
                              <button
                                type="button"
                                className={styles.btnOutline}
                                onClick={() => setReleasing(null)}
                              >
                                Keep
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className={styles.btnOutline}
                                disabled={action.busy !== null}
                                onClick={fire(async () => {
                                  const done = await action.run(
                                    'extend',
                                    () =>
                                      api.patch(`admin/reservations/${r.id}`, {
                                        extendBySeconds: 900,
                                      }),
                                    'Hold extended by 15 minutes.',
                                  );
                                  if (done !== null) void reload();
                                })}
                              >
                                Extend 15 min
                              </button>{' '}
                              <button
                                type="button"
                                className={styles.btnOutline}
                                disabled={action.busy !== null}
                                onClick={() => setReleasing(r.id)}
                              >
                                Release…
                              </button>
                            </>
                          )
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </AdminLoad>
    </section>
  );
}
