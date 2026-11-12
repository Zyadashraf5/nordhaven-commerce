'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { errorMessage, sessionAction } from '../../lib/api/browser';
import type { Principal, SessionState } from '../../lib/api/auth-types';

/**
 * Who is signed in, from the backend (`GET /api/v1/auth/principal` via
 * `/api/session`). Components use it to choose between signed-in and
 * signed-out UI; the backend still decides what each request may do.
 */
interface SessionContextValue {
  state: SessionState;
  principal: Principal | null;
  /** Re-reads the principal (after sign-in, MFA, sign-out). */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/session', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) {
        setState({ status: 'unavailable', message: 'The store is not reachable right now.' });
        return;
      }
      const body = (await response.json()) as { authenticated: boolean; principal?: Principal };
      setState(
        body.authenticated && body.principal
          ? { status: 'signed-in', principal: body.principal }
          : { status: 'signed-out' },
      );
    } catch (error) {
      setState({ status: 'unavailable', message: errorMessage(error) });
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await sessionAction('sign-out');
    } finally {
      await refresh();
    }
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<SessionContextValue>(
    () => ({
      state,
      principal: state.status === 'signed-in' ? state.principal : null,
      refresh,
      signOut,
    }),
    [state, refresh, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider');
  return context;
}

/** Same as useSession, but tolerates rendering outside the provider (tests). */
export function useOptionalSession(): SessionContextValue | null {
  return useContext(SessionContext);
}
