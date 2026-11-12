'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../ui/Icon';
import { api, errorMessage } from '../../lib/api/browser';
import { ApiError, type QueryValue } from '../../lib/api/client';
import { useOptionalSession } from '../providers/SessionProvider';
import styles from './AdminLayout.module.css';

/**
 * Shared live-data plumbing for the admin screens (F06 Batch 4).
 *
 * Every read goes through the BFF (`/api/hc/admin/*`); the backend decides
 * who may see it (ADMIN role + MFA-verified session). The screens never fall
 * back to sample data: a failure is shown as a failure, a 401 as an expired
 * session, a 403 as "not permitted", and a figure the API doesn't provide is
 * left out rather than invented.
 */

export type Resource<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; message: string; code: 'expired' | 'forbidden' | 'missing' | 'failed' };

function classify(error: unknown): {
  message: string;
  code: 'expired' | 'forbidden' | 'missing' | 'failed';
} {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return { code: 'expired', message: 'Your session has ended. Sign in again to continue.' };
    if (error.status === 403)
      return { code: 'forbidden', message: 'This account isn’t allowed to do that.' };
    if (error.status === 404)
      return { code: 'missing', message: 'That record doesn’t exist (or was removed).' };
  }
  return {
    code: 'failed',
    message: errorMessage(error, 'The store didn’t answer. Please try again.'),
  };
}

/** Reads one admin resource; `path` is relative to /api/v1 (e.g. `admin/orders`). Null skips the read. */
export function useAdminResource<T>(path: string | null, query?: Record<string, QueryValue>) {
  const [state, setState] = useState<Resource<T>>({ status: 'loading' });
  const key = path === null ? null : `${path}?${JSON.stringify(query ?? {})}`;
  const session = useOptionalSession();

  const load = useCallback(async () => {
    if (path === null) return;
    setState((current) => (current.status === 'ready' ? current : { status: 'loading' }));
    try {
      const data = await api.get<T>(path, query === undefined ? undefined : { query });
      setState({ status: 'ready', data });
    } catch (error) {
      const failure = classify(error);
      setState({ status: 'error', ...failure });
      if (failure.code === 'expired') void session?.refresh();
    }
    // `key` captures path + query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, reload: load, setState };
}

/** Reads every page of a keyset-paged admin list (`items` + `nextCursor`), up to `maxPages`. */
export async function readAllPages<T>(
  path: string,
  field: string,
  query: Record<string, QueryValue> = {},
  maxPages = 20,
): Promise<{ items: T[]; complete: boolean }> {
  const items: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const result: Record<string, unknown> = await api.get(path, {
      query: { ...query, limit: 50, ...(cursor !== null ? { cursor } : {}) },
    });
    items.push(...((result[field] as T[] | undefined) ?? []));
    cursor = (result.nextCursor as string | null | undefined) ?? null;
    if (cursor === null) return { items, complete: true };
  }
  return { items, complete: false };
}

/** Like useAdminResource, for a custom loader (several calls, paging). */
export function useAdminLoader<T>(loader: () => Promise<T>, deps: readonly unknown[]) {
  const [state, setState] = useState<Resource<T>>({ status: 'loading' });
  const session = useOptionalSession();
  const load = useCallback(async () => {
    setState((current) => (current.status === 'ready' ? current : { status: 'loading' }));
    try {
      setState({ status: 'ready', data: await loader() });
    } catch (error) {
      const failure = classify(error);
      setState({ status: 'error', ...failure });
      if (failure.code === 'expired') void session?.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    void load();
  }, [load]);
  return { state, reload: load };
}

/**
 * One guarded mutation at a time: a second click while a request is in flight
 * is ignored (no duplicate create/refund/transition), and the outcome is
 * reported exactly as the API answered.
 */
export function useAdminAction() {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const session = useOptionalSession();

  const run = useCallback(
    async <R,>(label: string, call: () => Promise<R>, success?: string): Promise<R | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setBusy(label);
      setNotice(null);
      try {
        const result = await call();
        if (success !== undefined) setNotice({ tone: 'ok', text: success });
        return result;
      } catch (error) {
        const failure = classify(error);
        setNotice({ tone: 'error', text: failure.message });
        if (failure.code === 'expired') void session?.refresh();
        return null;
      } finally {
        inFlight.current = false;
        setBusy(null);
      }
    },
    [session],
  );

  return { run, busy, notice, setNotice };
}

export function AdminNotice({ notice }: { notice: { tone: 'ok' | 'error'; text: string } | null }) {
  if (notice === null) return null;
  return (
    <div
      className={`${styles.demoAlert} hw-anim-drop`}
      role={notice.tone === 'error' ? 'alert' : 'status'}
    >
      <Icon
        name={notice.tone === 'error' ? 'alert' : 'check'}
        size={16}
        strokeWidth={2}
        stroke={notice.tone === 'error' ? '#a1362b' : 'var(--hw-status-available)'}
        aria-hidden="true"
      />
      <div>{notice.text}</div>
    </div>
  );
}

/** Loading / failure / expired / forbidden presentation around a resource. */
export function AdminLoad<T>({
  state,
  onRetry,
  what,
  children,
}: {
  state: Resource<T>;
  onRetry: () => void;
  /** "orders", "products"… for the messages. */
  what: string;
  children: (data: T) => ReactNode;
}) {
  const pathname = usePathname();
  if (state.status === 'loading') {
    return (
      <p className={styles.fieldHelp} role="status">
        Loading {what}…
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <div className={styles.emptyState} role="alert">
        <span className={styles.emptyIcon}>
          <Icon name="alert" size={24} strokeWidth={1.6} aria-hidden="true" />
        </span>
        <h2 className={styles.emptyTitle}>
          {state.code === 'expired'
            ? 'Your session has ended'
            : state.code === 'forbidden'
              ? 'Not permitted'
              : state.code === 'missing'
                ? 'Not found'
                : `We couldn’t load ${what}`}
        </h2>
        <p className={styles.emptyBody}>{state.message}</p>
        <div className={styles.actions}>
          {state.code === 'expired' ? (
            <Link
              href={`/account/sign-in?next=${encodeURIComponent(pathname || '/admin')}`}
              className={styles.btnPrimary}
            >
              Sign in again
            </Link>
          ) : state.code === 'failed' ? (
            <button type="button" className={styles.btnOutline} onClick={onRetry}>
              Try again
            </button>
          ) : null}
        </div>
      </div>
    );
  }
  return <>{children(state.data)}</>;
}

export function AdminEmpty({
  icon = 'info',
  title,
  body,
}: {
  icon?: IconName;
  title: string;
  body: string;
}) {
  return (
    <div className={styles.emptyState}>
      <span className={styles.emptyIcon}>
        <Icon name={icon} size={24} strokeWidth={1.6} aria-hidden="true" />
      </span>
      <h3 className={styles.emptyTitle}>{title}</h3>
      <p className={styles.emptyBody}>{body}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

export const egpMinor = (amountMinor: number, currency = 'EGP'): string =>
  `${currency} ${(amountMinor / 100).toLocaleString('en-US', {
    minimumFractionDigits: amountMinor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

export const adminDate = (iso: string | null | undefined): string =>
  iso === null || iso === undefined
    ? '—'
    : new Date(iso).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

export const shortId = (id: string, prefix = ''): string =>
  `${prefix}${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

/** EGP text ("4,845.50") → exact minor units, or null when not a valid amount. */
export function parseMinor(text: string): number | null {
  const clean = text.replace(/[,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [whole, fraction = ''] = clean.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
