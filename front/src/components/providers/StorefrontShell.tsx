import type { ReactNode } from 'react';
import { CommerceToast } from '../feedback/CommerceToast';
import { MotionProvider } from '../../motion/MotionProvider';
import { SignInSheet } from '../feedback/SignInSheet';
import { CartWishlistProvider } from './CartWishlistProvider';
import { SessionProvider } from './SessionProvider';
import { StorefrontUiProvider } from './StorefrontUiProvider';

/**
 * The storefront shell: the backend session (F06), the UI provider plus the sign-in sheet it controls,
 * and the live cart & wishlist store (F06, the customer's backend cart). Everything
 * that needs the sheet — the header, the product cards, the variant sheet — is
 * rendered inside this boundary.
 */
export function StorefrontShell({ children }: { children: ReactNode }) {
  return (
    <MotionProvider>
      <SessionProvider>
        <StorefrontUiProvider>
          <CartWishlistProvider>
            {children}
            <SignInSheet />
            <CommerceToast />
          </CartWishlistProvider>
        </StorefrontUiProvider>
      </SessionProvider>
    </MotionProvider>
  );
}
