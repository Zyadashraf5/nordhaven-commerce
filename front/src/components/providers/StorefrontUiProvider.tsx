'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * The approved boards state the rule plainly: browsing is public, but the cart
 * and the wishlist belong to an account. A signed-out tap therefore opens a
 * sign-in sheet and returns the visitor to the same page — never a dead end and
 * never a fake success.
 */
export type SignInReason = 'cart' | 'wishlist' | 'account';

export interface StorefrontUiContextValue {
  signInReason: SignInReason | null;
  requestSignIn: (reason: SignInReason) => void;
  closeSignIn: () => void;
  toast: string | null;
  showToast: (message: string) => void;
  dismissToast: () => void;
}

const StorefrontUiContext = createContext<StorefrontUiContextValue | null>(null);

export function StorefrontUiProvider({ children }: { children: ReactNode }) {
  const [signInReason, setSignInReason] = useState<SignInReason | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const requestSignIn = useCallback((reason: SignInReason) => {
    setSignInReason(reason);
  }, []);

  const closeSignIn = useCallback(() => {
    setSignInReason(null);
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  const value = useMemo<StorefrontUiContextValue>(
    () => ({
      signInReason,
      requestSignIn,
      closeSignIn,
      toast,
      showToast,
      dismissToast,
    }),
    [signInReason, requestSignIn, closeSignIn, toast, showToast, dismissToast],
  );

  return <StorefrontUiContext.Provider value={value}>{children}</StorefrontUiContext.Provider>;
}

export function useStorefrontUi(): StorefrontUiContextValue {
  const context = useContext(StorefrontUiContext);
  if (context === null) {
    throw new Error('useStorefrontUi must be used inside <StorefrontUiProvider>');
  }
  return context;
}
