'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, errorMessage } from '../../lib/api/browser';
import type { ApiProductDetail } from '../../lib/api/catalog-types';
import type {
  ApiCart,
  ApiCartLine,
  ApiWishlist,
  ApiWishlistItem,
} from '../../lib/api/commerce-types';
import {
  resolveCartLine,
  summariseCart,
  type CartLineSpec,
  type ResolvedCartLine,
} from '../../lib/cart';
import { toStorefrontProduct } from '../../lib/catalog-mapper';
import { cartItemFromLine, CART_LINE_MAX, wishlistEntryFromItem } from '../../lib/commerce-mapper';
import { resolveVariant, type VariantSelection } from '../../lib/variant';
import type { WishlistCatalogEntry } from '../../data/cart-sample';
import type { StorefrontProduct } from '../../data/types';
import { useOptionalSession } from './SessionProvider';
import { useStorefrontUi } from './StorefrontUiProvider';

/**
 * The live cart & wishlist store (F06 Batch 3).
 *
 * The cart and the wishlist belong to the signed-in customer and live on the
 * backend (`/cart*`, `/customers/me/wishlist*`); this store only mirrors what
 * the API last returned. Every change is an API call whose response replaces
 * the local copy, so prices, quantities and lines are always the backend's.
 * When a call fails the store says so and keeps the last confirmed state; it
 * never falls back to sample lines. Signed out, there is no cart: adding opens
 * the sign-in sheet.
 *
 * Product details (picture, colour/size words, strike-through price) come
 * from the public catalogue and are cached per slug; the API line's own price
 * is what's shown and summed.
 */

export interface CartToast {
  kind: 'removed' | 'restored' | 'wish' | 'cart' | 'error';
  text: string;
  /** Shows the Undo button. */
  withUndo: boolean;
  /** Shows the "View cart" link. */
  withCart: boolean;
  /** Shows the "View wishlist" link. */
  withWish: boolean;
}

/** What Undo restores: a removed cart line (re-added) or a removed saved item. */
type RemovedRecord =
  | { on: 'cart'; variantId: string; qty: number; name: string }
  | { on: 'wishlist'; productId: string; name: string };

export type CommerceStatus = 'loading' | 'signed-out' | 'not-customer' | 'ready' | 'error';

export type LiveWishlistEntry = WishlistCatalogEntry & { itemId: string; productId: string };

interface CartWishlistContextValue {
  status: CommerceStatus;
  /** Why the cart couldn't be loaded (status 'error'). */
  loadError: string | null;
  /** A change is on its way to the API; controls stay disabled meanwhile. */
  busy: boolean;
  reload: () => Promise<void>;
  /** The raw API lines (checkout reads ids and SKUs from here). */
  cartLines: ApiCartLine[];
  lines: CartLineSpec[];
  resolvedLines: ResolvedCartLine[];
  summary: ReturnType<typeof summariseCart>;
  /** Header badge: total items in the cart, including unavailable rows. */
  cartCount: number;
  wishlistEntries: LiveWishlistEntry[];
  /** Product details by slug (cart and wishlist pictures and variant words). */
  products: ReadonlyMap<string, StorefrontProduct>;
  priceAcked: boolean;
  toast: CartToast | null;
  ackPriceChange: () => void;
  /** Adds the exact variant the selection resolves to; opens sign-in when signed out. */
  addProduct: (
    product: StorefrontProduct,
    selection?: VariantSelection,
    quantity?: number,
  ) => Promise<boolean>;
  setQuantity: (key: string, qty: number) => void;
  increase: (key: string) => void;
  decrease: (key: string) => void;
  removeLine: (key: string) => void;
  isWished: (productId: string) => boolean;
  toggleWishlist: (product: Pick<StorefrontProduct, 'id' | 'name'>) => void;
  removeFromWishlist: (key: string) => void;
  /** Cart → wishlist ("Move to wishlist"). */
  moveToWishlist: (key: string) => void;
  /** Wishlist → cart. Passing a variant moves that exact combination. */
  moveToCart: (key: string, variant?: { colourId: string; sizeId: string | undefined }) => void;
  /** Re-reads the cart (after an order removed its lines). */
  refreshCart: () => Promise<void>;
  undo: () => void;
  dismissToast: () => void;
}

const CartWishlistContext = createContext<CartWishlistContextValue | null>(null);

function toastOf(kind: CartToast['kind'], text: string): CartToast {
  return {
    kind,
    text,
    withUndo: kind === 'removed',
    withCart: kind === 'cart',
    withWish: kind === 'wish',
  };
}

/** The API variant id of the exact SKU a selection resolves to. */
export function variantIdFor(
  product: StorefrontProduct,
  selection: VariantSelection = {},
): string | undefined {
  const variants = product.variants ?? [];
  if (variants.length === 1) return variants[0]?.variantId;
  const sku = resolveVariant(product, selection).sku;
  return variants.find((variant) => variant.sku === sku)?.variantId;
}

export function CartWishlistProvider({ children }: { children: ReactNode }) {
  const session = useOptionalSession();
  const { requestSignIn } = useStorefrontUi();
  const sessionStatus = session?.state.status ?? 'signed-out';
  const role = session?.principal?.role;

  const [status, setStatus] = useState<CommerceStatus>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cart, setCart] = useState<ApiCart | null>(null);
  const [wishlist, setWishlist] = useState<ApiWishlistItem[]>([]);
  const [products, setProducts] = useState<ReadonlyMap<string, StorefrontProduct>>(new Map());
  const [busy, setBusy] = useState(false);
  const [priceAcked, setPriceAcked] = useState(false);
  const [toast, setToast] = useState<CartToast | null>(null);
  const [removed, setRemoved] = useState<RemovedRecord | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requested = useRef(new Set<string>());

  const flash = useCallback((next: CartToast, ms = 6000) => {
    if (timer.current !== null) clearTimeout(timer.current);
    setToast(next);
    timer.current = setTimeout(() => {
      setToast(null);
      setRemoved(null);
    }, ms);
  }, []);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  /* Product details for every slug the cart and wishlist mention. */
  const ensureProducts = useCallback(async (slugs: string[]) => {
    const missing = [...new Set(slugs)].filter((slug) => !requested.current.has(slug));
    if (missing.length === 0) return;
    missing.forEach((slug) => requested.current.add(slug));
    const loaded = await Promise.all(
      missing.map(async (slug) => {
        try {
          const detail = await api.get<ApiProductDetail>(
            `catalog/products/${encodeURIComponent(slug)}`,
          );
          return [slug, toStorefrontProduct(detail)] as const;
        } catch {
          // An unpublished product has no public detail; the line still shows its API name and price.
          return null;
        }
      }),
    );
    setProducts((current) => {
      const next = new Map(current);
      for (const entry of loaded) if (entry !== null) next.set(entry[0], entry[1]);
      return next;
    });
  }, []);

  const adoptCart = useCallback(
    (next: ApiCart) => {
      setCart(next);
      void ensureProducts(next.lines.map((line) => line.productSlug));
    },
    [ensureProducts],
  );

  const adoptWishlist = useCallback(
    (next: ApiWishlist) => {
      setWishlist(next.items);
      void ensureProducts(next.items.map((item) => item.productSlug));
    },
    [ensureProducts],
  );

  const reload = useCallback(async () => {
    setStatus('loading');
    setLoadError(null);
    try {
      const [nextCart, nextWishlist] = await Promise.all([
        api.get<ApiCart>('cart'),
        api.get<ApiWishlist>('customers/me/wishlist'),
      ]);
      adoptCart(nextCart);
      adoptWishlist(nextWishlist);
      setStatus('ready');
    } catch (error) {
      setLoadError(errorMessage(error, 'We couldn’t load your cart. Please try again.'));
      setStatus('error');
    }
  }, [adoptCart, adoptWishlist]);

  const refreshCart = useCallback(async () => {
    try {
      adoptCart(await api.get<ApiCart>('cart'));
    } catch {
      // Keep the last confirmed cart; the next visit reloads it.
    }
  }, [adoptCart]);

  useEffect(() => {
    if (sessionStatus === 'loading') {
      setStatus('loading');
      return;
    }
    if (sessionStatus !== 'signed-in') {
      setCart(null);
      setWishlist([]);
      setStatus(sessionStatus === 'unavailable' ? 'error' : 'signed-out');
      if (sessionStatus === 'unavailable') setLoadError('The store is not reachable right now.');
      return;
    }
    if (role !== 'CUSTOMER') {
      setCart(null);
      setWishlist([]);
      setStatus('not-customer');
      return;
    }
    void reload();
  }, [sessionStatus, role, reload]);

  /* One change at a time: the API answer replaces the cart. */
  const mutate = useCallback(
    async <T,>(
      call: () => Promise<T>,
      onDone: (result: T) => void,
      failure: string,
    ): Promise<boolean> => {
      setBusy(true);
      try {
        onDone(await call());
        return true;
      } catch (error) {
        flash(toastOf('error', errorMessage(error, failure)));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [flash],
  );

  const lineById = useCallback(
    (key: string) => cart?.lines.find((line) => line.id === key),
    [cart],
  );

  const addVariant = useCallback(
    async (variantId: string, quantity: number, name: string) => {
      if (status !== 'ready') {
        if (status === 'signed-out') requestSignIn('cart');
        else flash(toastOf('error', 'Your cart isn’t available right now. Please try again.'));
        return false;
      }
      return mutate(
        () => api.post<ApiCart>('cart/items', { variantId, quantity }),
        (next) => {
          adoptCart(next);
          flash(toastOf('cart', `${name} added to your cart`));
        },
        'We couldn’t add that to your cart. Please try again.',
      );
    },
    [status, requestSignIn, mutate, adoptCart, flash],
  );

  const addProduct = useCallback(
    async (product: StorefrontProduct, selection: VariantSelection = {}, quantity = 1) => {
      if (status === 'signed-out') {
        requestSignIn('cart');
        return false;
      }
      if (status === 'loading') {
        flash(toastOf('error', 'Your cart is still loading. Please try again in a moment.'));
        return false;
      }
      const variantId = variantIdFor(product, selection);
      if (variantId === undefined) {
        // Sample sets have no orderable variant: there is no public bundle catalogue yet.
        const orderable = (product.variants ?? []).some(
          (variant) => variant.variantId !== undefined,
        );
        flash(
          toastOf(
            'error',
            orderable
              ? 'Choose an available option first.'
              : 'This item can’t be ordered online yet.',
          ),
        );
        return false;
      }
      return addVariant(variantId, quantity, product.name);
    },
    [status, requestSignIn, addVariant, flash],
  );

  const setQuantity = useCallback(
    (key: string, qty: number) => {
      const line = lineById(key);
      if (line === undefined) return;
      const quantity = Math.min(CART_LINE_MAX, Math.max(1, qty));
      void mutate(
        () => api.patch<ApiCart>(`cart/items/${line.id}`, { quantity }),
        adoptCart,
        'We couldn’t change the quantity. Your cart is unchanged.',
      );
    },
    [lineById, mutate, adoptCart],
  );

  const increase = useCallback(
    (key: string) => {
      const line = lineById(key);
      if (line !== undefined) setQuantity(key, line.quantity + 1);
    },
    [lineById, setQuantity],
  );

  const decrease = useCallback(
    (key: string) => {
      const line = lineById(key);
      if (line !== undefined && line.quantity > 1) setQuantity(key, line.quantity - 1);
    },
    [lineById, setQuantity],
  );

  const removeLine = useCallback(
    (key: string) => {
      const line = lineById(key);
      if (line === undefined) return;
      void mutate(
        () => api.delete<ApiCart>(`cart/items/${line.id}`),
        (next) => {
          adoptCart(next);
          if (line.variantId !== null) {
            setRemoved({
              on: 'cart',
              variantId: line.variantId,
              qty: line.quantity,
              name: line.productName,
            });
          }
          flash({
            ...toastOf('removed', `${line.productName} removed from your cart`),
            withUndo: line.variantId !== null,
          });
        },
        'We couldn’t remove that item. Your cart is unchanged.',
      );
    },
    [lineById, mutate, adoptCart, flash],
  );

  const isWished = useCallback(
    (productId: string) => wishlist.some((item) => item.productId === productId),
    [wishlist],
  );

  const removeFromWishlist = useCallback(
    (key: string) => {
      const item = wishlist.find(
        (candidate) => candidate.productSlug === key || candidate.id === key,
      );
      if (item === undefined) return;
      void mutate(
        () => api.delete<ApiWishlist>(`customers/me/wishlist/${item.id}`),
        (next) => {
          adoptWishlist(next);
          setRemoved({ on: 'wishlist', productId: item.productId, name: item.productName });
          flash(toastOf('removed', `${item.productName} removed from your wishlist`));
        },
        'We couldn’t remove that from your wishlist. Please try again.',
      );
    },
    [wishlist, mutate, adoptWishlist, flash],
  );

  const toggleWishlist = useCallback(
    (product: Pick<StorefrontProduct, 'id' | 'name'>) => {
      if (status === 'signed-out') {
        requestSignIn('wishlist');
        return;
      }
      if (status !== 'ready') {
        flash(toastOf('error', 'Your wishlist isn’t available right now. Please try again.'));
        return;
      }
      const saved = wishlist.find((item) => item.productId === product.id);
      if (saved !== undefined) {
        removeFromWishlist(saved.id);
        return;
      }
      void mutate(
        () => api.post<ApiWishlist>('customers/me/wishlist', { productId: product.id }),
        (next) => {
          adoptWishlist(next);
          flash(toastOf('wish', `${product.name} saved to your wishlist`));
        },
        'We couldn’t save that to your wishlist. Please try again.',
      );
    },
    [status, requestSignIn, wishlist, removeFromWishlist, mutate, adoptWishlist, flash],
  );

  const moveToWishlist = useCallback(
    (key: string) => {
      const line = lineById(key);
      if (line === undefined) return;
      void mutate(
        async () => {
          // Save first, so a failure never loses the item from both places.
          const nextWishlist = await api.post<ApiWishlist>('customers/me/wishlist', {
            productId: line.productId,
          });
          adoptWishlist(nextWishlist);
          return api.delete<ApiCart>(`cart/items/${line.id}`);
        },
        (next) => {
          adoptCart(next);
          flash(toastOf('wish', `${line.productName} moved to your wishlist`));
        },
        'We couldn’t move that item. Please check your cart and wishlist.',
      );
    },
    [lineById, mutate, adoptWishlist, adoptCart, flash],
  );

  const moveToCart = useCallback(
    (key: string, variant?: { colourId: string; sizeId: string | undefined }) => {
      const item = wishlist.find((candidate) => candidate.productSlug === key);
      if (item === undefined) return;
      const product = products.get(item.productSlug);
      const variantId =
        product === undefined
          ? undefined
          : variantIdFor(
              product,
              variant === undefined ? {} : { colourId: variant.colourId, sizeId: variant.sizeId },
            );
      if (variantId === undefined) {
        flash(toastOf('error', 'Choose an available option first.'));
        return;
      }
      void mutate(
        async () => {
          // Into the cart first, then out of the wishlist: a failure keeps it saved.
          const nextCart = await api.post<ApiCart>('cart/items', { variantId, quantity: 1 });
          adoptCart(nextCart);
          return api.delete<ApiWishlist>(`customers/me/wishlist/${item.id}`);
        },
        (next) => {
          adoptWishlist(next);
          flash(toastOf('cart', `${item.productName} moved to your cart`));
        },
        'We couldn’t move that item. Please check your cart and wishlist.',
      );
    },
    [wishlist, products, mutate, adoptCart, adoptWishlist, flash],
  );

  const undo = useCallback(() => {
    const record = removed;
    setRemoved(null);
    if (record === null) {
      setToast(null);
      return;
    }
    if (record.on === 'cart') {
      void mutate(
        () =>
          api.post<ApiCart>('cart/items', { variantId: record.variantId, quantity: record.qty }),
        (next) => {
          adoptCart(next);
          flash(toastOf('restored', `${record.name} is back in your cart`), 3000);
        },
        'We couldn’t put that back. Please add it again from the product page.',
      );
      return;
    }
    void mutate(
      () => api.post<ApiWishlist>('customers/me/wishlist', { productId: record.productId }),
      (next) => {
        adoptWishlist(next);
        flash(toastOf('restored', `${record.name} is back in your wishlist`), 3000);
      },
      'We couldn’t put that back. Please save it again from the product page.',
    );
  }, [removed, mutate, adoptCart, adoptWishlist, flash]);

  const dismissToast = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    setToast(null);
    setRemoved(null);
  }, []);

  /* "OK" on a price-change notice: re-setting the quantity refreshes the
     line's agreed price to the current one (the contract's documented way). */
  const ackPriceChange = useCallback(() => {
    setPriceAcked(true);
    const changed = cart?.lines.filter((line) => line.priceChanged) ?? [];
    if (changed.length === 0) return;
    void mutate(
      async () => {
        let last: ApiCart | null = null;
        for (const line of changed) {
          last = await api.patch<ApiCart>(`cart/items/${line.id}`, { quantity: line.quantity });
        }
        return last as ApiCart;
      },
      (next) => {
        adoptCart(next);
        setPriceAcked(false);
      },
      'We couldn’t confirm the new price. Please try again.',
    );
  }, [cart, mutate, adoptCart]);

  const cartLines = useMemo(() => cart?.lines ?? [], [cart]);
  const items = useMemo(
    () => cartLines.map((line) => cartItemFromLine(line, products.get(line.productSlug))),
    [cartLines, products],
  );
  const lines = useMemo<CartLineSpec[]>(
    () => cartLines.map((line) => ({ key: line.id, qty: line.quantity })),
    [cartLines],
  );
  const resolvedLines = useMemo(
    () =>
      items.map((item, index) => resolveCartLine(item, lines[index] ?? { key: item.key, qty: 1 })),
    [items, lines],
  );
  const summary = useMemo(() => summariseCart(items, lines), [items, lines]);
  const cartCount = summary.allCount;
  const wishlistEntries = useMemo(
    () => wishlist.map((item) => wishlistEntryFromItem(item, products.get(item.productSlug))),
    [wishlist, products],
  );

  const value = useMemo<CartWishlistContextValue>(
    () => ({
      status,
      loadError,
      busy,
      reload,
      cartLines,
      lines,
      resolvedLines,
      summary,
      cartCount,
      wishlistEntries,
      products,
      priceAcked,
      toast,
      ackPriceChange,
      addProduct,
      setQuantity,
      increase,
      decrease,
      removeLine,
      isWished,
      toggleWishlist,
      removeFromWishlist,
      moveToWishlist,
      moveToCart,
      refreshCart,
      undo,
      dismissToast,
    }),
    [
      status,
      loadError,
      busy,
      reload,
      cartLines,
      lines,
      resolvedLines,
      summary,
      cartCount,
      wishlistEntries,
      products,
      priceAcked,
      toast,
      ackPriceChange,
      addProduct,
      setQuantity,
      increase,
      decrease,
      removeLine,
      isWished,
      toggleWishlist,
      removeFromWishlist,
      moveToWishlist,
      moveToCart,
      refreshCart,
      undo,
      dismissToast,
    ],
  );

  return <CartWishlistContext.Provider value={value}>{children}</CartWishlistContext.Provider>;
}

export function useCartWishlist(): CartWishlistContextValue {
  const context = useContext(CartWishlistContext);
  if (context === null) {
    throw new Error('useCartWishlist must be used inside <CartWishlistProvider>');
  }
  return context;
}

/** Same as useCartWishlist, but tolerates rendering outside the provider (isolated tests). */
export function useOptionalCartWishlist(): CartWishlistContextValue | null {
  return useContext(CartWishlistContext);
}
