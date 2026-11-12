'use client';

import styles from './f04.module.css';

/**
 * Status pill for orders, pre-orders, returns, reviews and shipments.
 * Colours mirror the approved boards and the Warm Editorial status tokens:
 * available (green), attention (amber), error (red), info (blue).
 * Demo-only — no backend state is implied.
 */

export type F04StatusKind =
  | 'order'
  | 'pre-order'
  | 'return'
  | 'review'
  | 'shipment'
  | 'notification';

function pillKind(kind: F04StatusKind, status: string) {
  const base = {
    label: status,
    variant: 'statusAttention' as const,
  };
  switch (kind) {
    case 'order':
      switch (status) {
        case 'FULFILLED':
          return { label: 'Fulfilled', variant: 'statusAvailable' as const };
        case 'PAID':
          return { label: 'Paid', variant: 'statusAvailable' as const };
        case 'PAID_PENDING_ALLOCATION':
          return { label: 'Payment received', variant: 'statusAvailable' as const };
        case 'PENDING_PAYMENT':
          return { label: 'Awaiting payment', variant: 'statusAttention' as const };
        case 'PAYMENT_FAILED':
          return { label: 'Payment failed', variant: 'statusError' as const };
        case 'CANCELLED':
          return { label: 'Cancelled', variant: 'statusError' as const };
        case 'EXPIRED':
          return { label: 'Expired', variant: 'statusError' as const };
        case 'REFUNDED':
          return { label: 'Refunded', variant: 'statusInfo' as const };
        default:
          return base;
      }
    case 'pre-order':
      switch (status) {
        case 'CONVERTED':
          return { label: 'Converted to order', variant: 'statusAvailable' as const };
        case 'STOCK_RESERVED':
          return { label: 'Stock reserved', variant: 'statusAvailable' as const };
        case 'AWAITING_STOCK':
          return { label: 'Awaiting restock', variant: 'statusAttention' as const };
        case 'AWAITING_PAYMENT':
          return { label: 'Ready to pay', variant: 'statusAttention' as const };
        case 'CANCELLED':
          return { label: 'Cancelled', variant: 'statusError' as const };
        case 'EXPIRED':
          return { label: 'Expired', variant: 'statusError' as const };
        default:
          return base;
      }
    case 'return':
      switch (status) {
        case 'REFUNDED':
          return { label: 'Refunded', variant: 'statusAvailable' as const };
        case 'RECEIVED':
          return { label: 'Received', variant: 'statusAvailable' as const };
        case 'APPROVED':
          return { label: 'Approved', variant: 'statusAvailable' as const };
        case 'REQUESTED':
          return { label: 'Requested', variant: 'statusAttention' as const };
        case 'REJECTED':
          return { label: 'Rejected', variant: 'statusError' as const };
        case 'CANCELLED':
          return { label: 'Cancelled', variant: 'statusError' as const };
        default:
          return base;
      }
    case 'review':
      switch (status) {
        case 'APPROVED':
          return { label: 'Published', variant: 'statusAvailable' as const };
        case 'PENDING':
          return { label: 'Awaiting moderation', variant: 'statusAttention' as const };
        case 'REJECTED':
          return { label: 'Rejected', variant: 'statusError' as const };
        default:
          return base;
      }
    case 'shipment':
      switch (status) {
        case 'DELIVERED':
          return { label: 'Delivered', variant: 'statusAvailable' as const };
        case 'HANDED_OVER':
          return { label: 'With courier', variant: 'statusAvailable' as const };
        case 'PACKED':
          return { label: 'Packed', variant: 'statusAttention' as const };
        case 'PREPARED':
          return { label: 'Prepared', variant: 'statusAttention' as const };
        case 'CANCELLED':
          return { label: 'Cancelled', variant: 'statusError' as const };
        default:
          return base;
      }
    case 'notification':
      switch (status) {
        case 'DELIVERED':
          return { label: 'Delivered', variant: 'statusAvailable' as const };
        case 'PENDING':
          return { label: 'Pending', variant: 'statusAttention' as const };
        case 'FAILED':
          return { label: 'Failed', variant: 'statusError' as const };
        case 'SKIPPED':
          return { label: 'Skipped', variant: 'statusInfo' as const };
        default:
          return base;
      }
    default:
      return base;
  }
}

/*
 * Arabic labels for the RTL previews. From the Admin Orders RTL board where
 * it has them; entries marked * were translated in the polish pass.
 */
const AR_LABELS: Partial<Record<F04StatusKind, Record<string, string>>> = {
  order: {
    FULFILLED: 'تم التنفيذ', // *
    PAID: 'مدفوع',
    PAID_PENDING_ALLOCATION: 'تم استلام الدفع', // *
    PENDING_PAYMENT: 'بانتظار الدفع',
    PAYMENT_FAILED: 'فشل الدفع',
    CANCELLED: 'ملغاة',
    EXPIRED: 'انتهت المهلة',
    REFUNDED: 'مسترد', // *
  },
  'pre-order': {
    CONVERTED: 'تحوّل إلى طلب', // *
    STOCK_RESERVED: 'تم حجز المخزون', // *
    AWAITING_STOCK: 'بانتظار المخزون', // *
    AWAITING_PAYMENT: 'بانتظار الدفع',
    CANCELLED: 'ملغاة',
    EXPIRED: 'انتهت المهلة',
  },
};

interface OrderStatusBadgeProps {
  kind: F04StatusKind;
  status: string;
  /** `ar` uses the Arabic label where one exists (RTL previews). */
  lang?: 'en' | 'ar';
  /** Show a small dot instead of text (used in order list summaries). */
  dot?: boolean;
}

export function OrderStatusBadge({
  kind,
  status,
  dot = false,
  lang = 'en',
}: OrderStatusBadgeProps) {
  const pill = pillKind(kind, status);
  const label = (lang === 'ar' ? AR_LABELS[kind]?.[status] : undefined) ?? pill.label;
  const variant = pill.variant;
  return (
    <span className={`${styles.statusPill} ${styles[variant]}`}>
      {dot ? (
        <span
          aria-hidden="true"
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: 'currentColor',
            display: 'inline-block',
          }}
        />
      ) : null}
      {label}
    </span>
  );
}

/**
 * Coloured dot + short status text used in compact order list rows.
 */
export function OrderStatusDot({ kind, status }: { kind: F04StatusKind; status: string }) {
  const { label, variant } = pillKind(kind, status);
  return (
    <span className={`${styles.statusPill} ${styles[variant]}`} style={{ gap: 4 }}>
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: 'currentColor',
          display: 'inline-block',
        }}
      />
      <span className="hw-visually-hidden">{label}</span>
    </span>
  );
}
