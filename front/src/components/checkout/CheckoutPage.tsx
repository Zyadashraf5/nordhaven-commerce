'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '../ui/Icon';
import { StorefrontImage } from '../ui/StorefrontImage';
import { RequireSession } from '../auth/RequireSession';
import { useCartWishlist } from '../providers/CartWishlistProvider';
import { governorates } from '../../data/account-sample';
import type { AccountLang } from '../account/AccountAddresses';
import { formatMoney } from '../../data/money';
import { api, errorBody, errorMessage, newIdempotencyKey } from '../../lib/api/browser';
import type { ApiAddressInput, ApiCustomerAddress } from '../../lib/api/catalog-types';
import type { ApiCheckoutQuote, ApiOrder, ApiShippingOptions } from '../../lib/api/commerce-types';
import { blockerMessage } from '../../lib/commerce-mapper';
import type { ResolvedCartLine } from '../../lib/cart';
import styles from './CheckoutPage.module.css';

/**
 * The checkout flow (Stage 3 checkout boards) on the live API (F06 Batch 3):
 * delivery address (the customer's saved addresses) → shipping method
 * (`GET /shipping/options`) → payment → review, where the server prices the
 * cart (`POST /checkout/quotes`) and "Place order" creates the order
 * (`POST /orders`, with the quote fingerprint and one Idempotency-Key per
 * confirmed quote, so a double tap or a retry can never create two orders).
 *
 * The backend is the only source of prices, tax and totals; nothing here adds
 * them up for the order. Placing the order holds the stock for the order's
 * payment window (HC-DEC-004); payment is started afterwards, from the order
 * page, and is never shown as successful unless the backend says so.
 */
const FRAME_COPY = {
  en: {
    title: 'Checkout',
    stepOf: (n: number) => `Step ${n} of 4`,
    short: { 1: 'Delivery', 2: 'Shipping', 3: 'Payment', 4: 'Review' } as Record<number, string>,
    long: {
      1: 'Delivery address',
      2: 'Shipping method',
      3: 'Payment method',
      4: 'Review & place order',
    } as Record<number, string>,
    showSummary: 'Show order summary',
    hideSummary: 'Hide order summary',
    summary: 'Order summary',
    editCart: 'Edit cart',
    subtotal: (n: number) => `Subtotal · ${n} items`,
    discounts: 'Discounts',
    delivery: 'Delivery',
    tax: 'Tax',
    calculated: 'Calculated at checkout',
    estimated: 'Estimated total',
    netSubtotal: 'Subtotal before tax',
    total: 'Total',
    summaryNote:
      'Delivery options and costs are confirmed once you add an address. Return eligibility is shown per item on each product page.',
    totalSoFar: 'Total so far',
    back: 'Back',
    continueTo: (next: string) => `Continue to ${next.toLowerCase()}`,
    placeOrder: 'Place order',
    placing: 'Placing your order…',
    change: 'Change',
  },
  ar: {
    title: 'إتمام الشراء', // *
    stepOf: (n: number) => `الخطوة ${n} من 4`,
    short: { 1: 'التوصيل', 2: 'الشحن', 3: 'الدفع', 4: 'المراجعة' } as Record<number, string>,
    long: {
      1: 'عنوان التوصيل',
      2: 'طريقة الشحن', // *
      3: 'طريقة الدفع', // *
      4: 'راجع طلبك',
    } as Record<number, string>,
    showSummary: 'عرض ملخص الطلب', // *
    hideSummary: 'إخفاء ملخص الطلب', // *
    summary: 'ملخص الطلب',
    editCart: 'تعديل السلة', // *
    subtotal: (n: number) => `المجموع الفرعي · ${n} منتجات`,
    discounts: 'يشمل توفيرًا على العروض',
    delivery: 'التوصيل',
    tax: 'الضريبة',
    calculated: 'يُحسب عند إتمام الطلب', // *
    estimated: 'الإجمالي التقديري', // *
    netSubtotal: 'المجموع قبل الضريبة', // *
    total: 'الإجمالي', // *
    summaryNote: 'تظهر أهلية الإرجاع لكل منتج في صفحة الطلب.',
    totalSoFar: 'الإجمالي حتى الآن', // *
    back: 'رجوع', // *
    continueTo: (next: string) => `متابعة إلى ${next}`, // *
    placeOrder: 'إتمام الطلب والدفع',
    placing: 'جارٍ إرسال طلبك…', // *
    change: 'تعديل',
  },
};

type Loadable<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; message: string };

/** Exact minor units from the API; the store settles in EGP only. */
const money = (amountMinor: number, currency = 'EGP') =>
  currency === 'EGP'
    ? formatMoney({ amountMinor, currency })
    : `${currency} ${(amountMinor / 100).toFixed(2)}`;

export function CheckoutPage({ lang }: { lang: AccountLang }) {
  return (
    <RequireSession>
      <CheckoutFlow lang={lang} />
    </RequireSession>
  );
}

function CheckoutFlow({ lang }: { lang: AccountLang }) {
  const t = FRAME_COPY[lang];
  const router = useRouter();
  const {
    status: cartStatus,
    loadError,
    reload,
    resolvedLines,
    summary,
    cartLines,
    refreshCart,
  } = useCartWishlist();

  const [step, setStep] = useState<number>(1);
  const [addresses, setAddresses] = useState<Loadable<ApiCustomerAddress[]>>({ status: 'idle' });
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [shipping, setShipping] = useState<Loadable<ApiShippingOptions>>({ status: 'idle' });
  const [shippingCode, setShippingCode] = useState<string | null>(null);
  const [quote, setQuote] = useState<Loadable<ApiCheckoutQuote>>({ status: 'idle' });
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  // One Idempotency-Key per confirmed quote: a retry of the same quote reuses
  // it (the backend then returns the order the first request created).
  const orderKey = useRef<{ fingerprint: string; key: string } | null>(null);
  const placingNow = useRef(false);

  const loadAddresses = useCallback(async (select?: string) => {
    setAddresses({ status: 'loading' });
    try {
      const { addresses: list } = await api.get<{ addresses: ApiCustomerAddress[] }>(
        'customers/me/addresses',
      );
      setAddresses({ status: 'ready', data: list });
      setSelectedAddressId((current) => {
        if (select !== undefined) return select;
        if (current !== null && list.some((address) => address.id === current)) return current;
        return (list.find((address) => address.isDefault) ?? list[0])?.id ?? null;
      });
    } catch (error) {
      setAddresses({
        status: 'error',
        message: errorMessage(error, 'We couldn’t load your addresses.'),
      });
    }
  }, []);

  useEffect(() => {
    if (cartStatus === 'ready') void loadAddresses();
  }, [cartStatus, loadAddresses]);

  const selectedAddress =
    addresses.status === 'ready'
      ? (addresses.data.find((a) => a.id === selectedAddressId) ?? null)
      : null;
  const destination = selectedAddress?.countryCode ?? null;

  const loadShipping = useCallback(async (country: string) => {
    setShipping({ status: 'loading' });
    try {
      const options = await api.get<ApiShippingOptions>('shipping/options', {
        query: { destinationCountryCode: country },
      });
      setShipping({ status: 'ready', data: options });
      setShippingCode((current) =>
        current !== null && options.options.some((option) => option.code === current)
          ? current
          : (options.options[0]?.code ?? null),
      );
    } catch (error) {
      setShipping({
        status: 'error',
        message: errorMessage(error, 'We couldn’t load delivery options.'),
      });
    }
  }, []);

  const loadQuote = useCallback(async (country: string) => {
    setQuote({ status: 'loading' });
    try {
      const next = await api.post<ApiCheckoutQuote>('checkout/quotes', {
        destinationCountryCode: country,
      });
      setQuote({ status: 'ready', data: next });
    } catch (error) {
      setQuote({
        status: 'error',
        message: errorMessage(error, 'We couldn’t calculate your total.'),
      });
    }
  }, []);

  /* Shipping options follow the chosen destination; the quote is taken fresh
     every time the review step opens (and after any refusal). */
  const pastAddress = step >= 2;
  useEffect(() => {
    if (destination !== null && pastAddress) void loadShipping(destination);
  }, [destination, pastAddress, loadShipping]);

  useEffect(() => {
    if (destination !== null && step === 4) void loadQuote(destination);
  }, [destination, step, loadQuote, cartLines]);

  if (cartStatus !== 'ready') {
    return (
      <div className={styles.main}>
        <h1 className={styles.headline}>{t.title}</h1>
        {cartStatus === 'loading' ? (
          <p className={styles.sectionIntro} role="status">
            Loading your cart…
          </p>
        ) : cartStatus === 'error' ? (
          <div className={styles.demoAlert} role="alert">
            <Icon name="alert" size={18} strokeWidth={2} stroke="#a1362b" aria-hidden="true" />
            <div>
              <strong>We couldn’t load your cart</strong>
              <p style={{ margin: '4px 0 0' }}>{loadError ?? 'Please try again.'}</p>
              <button type="button" className={styles.btnOutline} onClick={() => void reload()}>
                Try again
              </button>
            </div>
          </div>
        ) : (
          <p className={styles.sectionIntro}>
            Checkout is for customer accounts. Sign in with a customer account to place an order.
          </p>
        )}
      </div>
    );
  }

  if (cartLines.length === 0) {
    return (
      <div className={styles.main}>
        <div className={styles.headRow}>
          <div className={styles.headTitles}>
            <h1 className={styles.headline} data-intro data-split="words">
              Your cart is empty
            </h1>
          </div>
          <Link href="/products" className={styles.continueLink}>
            <Icon name="chevron-left" size={16} strokeWidth={2} aria-hidden="true" />
            Continue shopping
          </Link>
        </div>
        <p className={styles.sectionIntro}>
          Add items to your cart, then come back here to check out.
        </p>
        <p className={styles.sectionIntro}>
          Placed an order already? <Link href="/account/orders">See your orders</Link>.
        </p>
      </div>
    );
  }

  const readyQuote = quote.status === 'ready' ? quote.data : null;
  const shippingOptions = shipping.status === 'ready' ? shipping.data : null;
  const chosenShipping =
    shippingOptions?.options.find((option) => option.code === shippingCode) ?? null;
  const canProceed =
    step === 1 ? selectedAddress !== null : step === 2 ? chosenShipping !== null : true;
  const placeDisabled = placing || readyQuote === null || !readyQuote.ready;
  const shownTotal =
    readyQuote !== null && step === 4
      ? money(readyQuote.totalMinor, readyQuote.currency)
      : summary.total;

  const placeOrder = async (): Promise<void> => {
    if (placingNow.current || readyQuote === null || !readyQuote.ready || destination === null)
      return;
    placingNow.current = true;
    setPlacing(true);
    setPlaceError(null);
    if (orderKey.current?.fingerprint !== readyQuote.fingerprint) {
      orderKey.current = { fingerprint: readyQuote.fingerprint, key: newIdempotencyKey() };
    }
    try {
      const order = await api.post<ApiOrder>(
        'orders',
        { destinationCountryCode: destination, expectedFingerprint: readyQuote.fingerprint },
        { idempotencyKey: orderKey.current.key },
      );
      // The ordered lines are gone from the cart now; mirror that, then show the order.
      await refreshCart();
      router.push(`/order-confirmation?order=${encodeURIComponent(order.id)}`);
      return;
    } catch (error) {
      const body = errorBody(error);
      if (body?.code === 'ORDER_QUOTE_CHANGED') {
        setPlaceError(
          'Prices or availability changed since this total was calculated, so no order was placed. Check the updated total below and place your order again.',
        );
        void loadQuote(destination);
      } else if (body?.code === 'ORDER_NOT_READY') {
        setPlaceError(
          'Your order can’t be placed yet, so nothing was ordered. See what needs attention below.',
        );
        void loadQuote(destination);
      } else {
        // Unknown outcome (e.g. the connection dropped): the same key is kept,
        // so trying again can only ever return the one order, never a second.
        setPlaceError(
          `${errorMessage(error, 'We couldn’t confirm your order.')} No payment was taken. Try again — if the first attempt reached us, you’ll get that same order, not a second one.`,
        );
      }
    }
    placingNow.current = false;
    setPlacing(false);
  };

  const summaryCard = (
    <aside className={styles.summaryCard} aria-label={t.summary}>
      <div className={styles.summaryHeader}>
        <h2>{t.summary}</h2>
        <Link href="/cart" className={styles.continueLink}>
          {t.editCart} <Icon name="chevron-right" size={16} strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>
      <ul className={styles.summaryItems}>
        {resolvedLines.map((line) => (
          <SummaryItem key={line.item.key} line={line} />
        ))}
      </ul>
      {readyQuote !== null && step === 4 ? (
        <QuoteTotals quote={readyQuote} lang={lang} />
      ) : (
        <div className={styles.summaryTotals}>
          <div className={styles.summaryTotalRow}>
            <span>{t.subtotal(summary.allCount)}</span>
            <bdi>{summary.subtotal}</bdi>
          </div>
          {summary.discount !== null ? (
            <div className={styles.summaryTotalRow}>
              <span>{t.discounts}</span>
              <bdi className={styles.summaryItemWas}>{summary.discount}</bdi>
            </div>
          ) : null}
          <div className={styles.summaryTotalRow}>
            <span>{t.delivery}</span>
            <span>{t.calculated}</span>
          </div>
          <div className={styles.summaryTotalRow}>
            <span>{t.tax}</span>
            <span>{t.calculated}</span>
          </div>
          <div className={styles.summaryGrand}>
            <span>{t.estimated}</span>
            <bdi>{summary.total}</bdi>
          </div>
        </div>
      )}
      <p className={styles.summaryNote}>{t.summaryNote}</p>
    </aside>
  );

  const stepContent =
    step === 1 ? (
      <AddressStep
        lang={lang}
        addresses={addresses}
        selectedAddressId={selectedAddressId}
        onSelect={setSelectedAddressId}
        onCreated={(id) => void loadAddresses(id)}
        onRetry={() => void loadAddresses()}
      />
    ) : step === 2 ? (
      <ShippingStep
        lang={lang}
        shipping={shipping}
        selectedCode={shippingCode}
        onSelect={setShippingCode}
        onRetry={() => destination !== null && void loadShipping(destination)}
      />
    ) : step === 3 ? (
      <PaymentStep lang={lang} environment={shippingOptions?.environment ?? null} />
    ) : (
      <ReviewStep
        lang={lang}
        address={selectedAddress}
        shippingOptions={shippingOptions}
        shippingLabel={chosenShipping?.label ?? null}
        quote={quote}
        lines={resolvedLines}
        onRetry={() => destination !== null && void loadQuote(destination)}
      />
    );

  return (
    <div
      className={styles.main}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      lang={lang === 'ar' ? 'ar' : 'en'}
    >
      {/* Narrow boards: the summary collapses behind a toggle above the title. */}
      <button
        type="button"
        className={styles.summaryToggle}
        aria-expanded={summaryOpen}
        aria-controls="checkout-summary"
        onClick={() => setSummaryOpen((open) => !open)}
      >
        <Icon name="bag" size={18} strokeWidth={1.8} aria-hidden="true" />
        <span className={styles.summaryToggleLabel}>
          {summaryOpen ? t.hideSummary : t.showSummary}
        </span>
        <Icon
          name="chevron-down"
          size={16}
          strokeWidth={2}
          aria-hidden="true"
          className={summaryOpen ? styles.chevronOpen : undefined}
        />
        <bdi className={styles.summaryToggleTotal}>{shownTotal}</bdi>
      </button>

      <h1 className={`${styles.headline} ${lang === 'ar' ? styles.headlineAr : ''}`}>{t.title}</h1>

      <div className={styles.stepper}>
        <p className={styles.stepperText}>
          <bdi>{t.stepOf(step)}</bdi>
          <span className={styles.stepperSep}>·</span>
          <strong>
            <bdi>{t.short[step]}</bdi>
          </strong>
        </p>
        <ol className={styles.stepperBar}>
          {[1, 2, 3, 4].map((n) => (
            <li
              key={n}
              className={`${styles.stepperSeg} ${n <= step ? styles.stepperSegDone : ''}`}
              aria-current={n === step ? 'step' : undefined}
            >
              {t.short[n]}
            </li>
          ))}
        </ol>
      </div>

      <div className={styles.columns}>
        <div className={styles.content}>
          <ol className={styles.stepList}>
            {[1, 2, 3, 4].map((n) =>
              n === step ? (
                <li key={n} className={styles.stepCurrent}>
                  {stepContent}

                  <div className={styles.stepNav}>
                    <div className={styles.stepNavTotal}>
                      <span>{step === 4 && readyQuote !== null ? t.total : t.totalSoFar}</span>
                      <bdi>{shownTotal}</bdi>
                    </div>
                    {step > 1 ? (
                      <button
                        type="button"
                        className={styles.btnOutline}
                        disabled={placing}
                        onClick={() => {
                          setPlaceError(null);
                          setStep((s) => s - 1);
                        }}
                      >
                        {t.back}
                      </button>
                    ) : null}
                    {step < 4 ? (
                      <button
                        type="button"
                        className={styles.btnPrimary}
                        disabled={!canProceed}
                        onClick={() => setStep((s) => s + 1)}
                      >
                        {t.continueTo(t.short[step + 1] ?? '')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.btnPrimary}
                        disabled={placeDisabled}
                        aria-busy={placing}
                        onClick={() => void placeOrder()}
                      >
                        {placing ? <span className={styles.spinner} aria-hidden="true" /> : null}
                        {placing ? t.placing : t.placeOrder}
                      </button>
                    )}
                  </div>

                  {step === 4 && placeError !== null ? (
                    <div className={styles.demoAlert} role="alert">
                      <Icon
                        name="alert"
                        size={18}
                        strokeWidth={2}
                        stroke="#a1362b"
                        aria-hidden="true"
                      />
                      <div>
                        <strong>No order was placed</strong>
                        <p style={{ margin: '4px 0 0' }}>{placeError}</p>
                        <p style={{ margin: '4px 0 0' }}>
                          <Link href="/account/orders">Check your orders</Link>
                        </p>
                      </div>
                    </div>
                  ) : null}
                </li>
              ) : (
                <li key={n} className={styles.stepRow}>
                  <span className={`${styles.stepNum} ${n < step ? styles.stepNumDone : ''}`}>
                    {n < step ? (
                      <Icon name="check" size={14} strokeWidth={2.4} aria-hidden="true" />
                    ) : (
                      n
                    )}
                  </span>
                  <span className={styles.stepRowLabel}>{t.long[n]}</span>
                  {n < step ? (
                    <button
                      type="button"
                      className={styles.stepRowEdit}
                      disabled={placing}
                      onClick={() => {
                        setPlaceError(null);
                        setStep(n);
                      }}
                    >
                      {t.change}
                    </button>
                  ) : null}
                </li>
              ),
            )}
          </ol>
        </div>

        <div
          id="checkout-summary"
          className={`${styles.summaryColumn} ${summaryOpen ? styles.summaryColumnOpen : ''}`}
        >
          {summaryCard}
        </div>
      </div>
    </div>
  );
}

function SummaryItem({ line }: { line: ResolvedCartLine }) {
  return (
    <li className={styles.summaryItem}>
      <span className={styles.summaryItemImage}>
        <StorefrontImage image={line.item.image} alt="" fill sizes="64px" />
      </span>
      <div className={styles.summaryItemBody}>
        <span className={styles.summaryItemName}>{line.item.name}</span>
        <span className={styles.summaryItemVariant}>
          <bdi>{line.item.variant}</bdi>
        </span>
      </div>
      {/* "3 × EGP 4,845" is the unit price; the line total follows it. */}
      <bdi className={styles.summaryItemQtyPrice}>
        {line.spec.qty} × {money(Math.round(line.item.priceEgp * 100))}
        {line.spec.qty > 1 ? ` = ${line.total}` : ''}
      </bdi>
      {line.wasTotal !== null ? (
        <span className={styles.summaryItemWas}>{line.wasTotal}</span>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * Server totals (the quote)
 * ------------------------------------------------------------------ */

function QuoteTotals({ quote, lang }: { quote: ApiCheckoutQuote; lang: AccountLang }) {
  const t = FRAME_COPY[lang];
  const inclusive = quote.lines.length > 0 && quote.lines.every((line) => line.taxInclusive);
  const rates = [...new Set(quote.lines.map((line) => line.taxRateBasisPoints))];
  const rateText = rates.length === 1 && rates[0] !== undefined ? ` ${rates[0] / 100}%` : '';
  return (
    <div className={styles.summaryTotals}>
      <div className={styles.summaryTotalRow}>
        <span>{t.netSubtotal}</span>
        <bdi>{money(quote.netSubtotalMinor, quote.currency)}</bdi>
      </div>
      <div className={styles.summaryTotalRow}>
        <span>
          {t.tax}
          {rateText}
          {inclusive ? (lang === 'ar' ? ' (مشمولة)' : ' (included in prices)') : ''}
        </span>
        <bdi>{money(quote.taxTotalMinor, quote.currency)}</bdi>
      </div>
      <div className={styles.summaryGrand}>
        <span>{t.total}</span>
        <bdi>{money(quote.totalMinor, quote.currency)}</bdi>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Step 1 — Delivery address (saved addresses, add one inline)
 * ------------------------------------------------------------------ */

interface AddressCopy {
  title: string;
  intro: string;
  add: string;
  defaultPill: string;
  formTitle: string;
  required: string;
  fields: {
    recipient: string;
    phone: string;
    governorate: string;
    city: string;
    street: string;
    building: string;
    postal: string;
  };
  optional: string;
  savedNote: string;
  errSelect: string;
  errPhone: string;
  errPostal: string;
  none: string;
  loading: string;
  loadError: string;
  retry: string;
  cancel: string;
  save: string;
  saving: string;
}

const ADDRESS_COPY: Record<AccountLang, AddressCopy> = {
  ar: {
    title: 'عنوان التوصيل',
    intro: 'اختر مكان تسليم طلبك. يتم اختيار عنوانك الافتراضي أولاً عند الدفع.',
    add: 'إضافة عنوان جديد',
    defaultPill: 'افتراضي',
    formTitle: 'عنوان توصيل جديد',
    required: 'جميع الحقول إلزامية ما لم يُشار إلى غير ذلك.',
    fields: {
      recipient: 'الاسم الكامل',
      phone: 'رقم الجوال',
      governorate: 'المحافظة',
      city: 'المدينة / المنطقة',
      street: 'عنوان الشارع',
      building: 'المبنى / الشقة',
      postal: 'الرمز البريدي',
    },
    optional: '(اختياري)',
    savedNote: 'يُحفظ العنوان في حسابك.', // *
    errSelect: 'اختر عنواناً للمتابعة',
    errPhone: 'أدخل 10 أرقام بعد +20، مثل 100 000 0000',
    errPostal: 'الرمز البريدي في مصر يتكون من 5 أرقام',
    none: 'لا توجد عناوين محفوظة بعد. أضف عنواناً للمتابعة.', // *
    loading: 'جارٍ تحميل عناوينك…', // *
    loadError: 'تعذّر تحميل عناوينك.', // *
    retry: 'حاول مرة أخرى', // *
    cancel: 'إلغاء', // *
    save: 'حفظ العنوان', // *
    saving: 'جارٍ الحفظ…', // *
  },
  en: {
    title: 'Delivery address',
    intro:
      'Choose where your order should be delivered. Your default address is selected first at checkout.',
    add: 'Add a new address',
    defaultPill: 'Default',
    formTitle: 'New delivery address',
    required: 'All fields are required unless marked optional.',
    fields: {
      recipient: 'Full name',
      phone: 'Mobile number',
      governorate: 'Governorate',
      city: 'City / area',
      street: 'Street address',
      building: 'Building, floor, apartment',
      postal: 'Postal code',
    },
    optional: '(optional)',
    savedNote: 'The address is saved to your account.',
    errSelect: 'Select an address to continue',
    errPhone: 'Enter a 10-digit mobile number after +20, like 100 000 0000',
    errPostal: 'Postal codes in Egypt have 5 digits',
    none: 'You have no saved addresses yet. Add one to continue.',
    loading: 'Loading your addresses…',
    loadError: 'We couldn’t load your addresses.',
    retry: 'Try again',
    cancel: 'Cancel',
    save: 'Save address',
    saving: 'Saving…',
  },
};

interface NewAddress {
  recipient: string;
  phone: string;
  governorate: string;
  city: string;
  street: string;
  building: string;
  postal: string;
}

const blankAddress: NewAddress = {
  recipient: '',
  phone: '',
  governorate: '',
  city: '',
  street: '',
  building: '',
  postal: '',
};

function AddressStep({
  lang,
  addresses,
  selectedAddressId,
  onSelect,
  onCreated,
  onRetry,
}: {
  lang: AccountLang;
  addresses: Loadable<ApiCustomerAddress[]>;
  selectedAddressId: string | null;
  onSelect: (id: string) => void;
  onCreated: (id: string) => void;
  onRetry: () => void;
}) {
  const copy = ADDRESS_COPY[lang];
  const list = addresses.status === 'ready' ? addresses.data : [];
  const [showForm, setShowForm] = useState(false);
  const [value, setValue] = useState<NewAddress>(blankAddress);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const addAddress = async (): Promise<void> => {
    const next: Record<string, string> = {};
    if (value.recipient.trim() === '') next.recipient = copy.fields.recipient;
    const digits = value.phone.replace(/[^\d]/g, '');
    if (!/^1[0-9]{9}$/.test(digits)) next.phone = copy.errPhone;
    if (value.governorate === '') next.governorate = copy.fields.governorate;
    if (value.city.trim() === '') next.city = copy.fields.city;
    if (value.street.trim() === '') next.street = copy.fields.street;
    if (value.postal.trim() !== '' && !/^[0-9]{5}$/.test(value.postal.trim()))
      next.postal = copy.errPostal;
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const input: ApiAddressInput = {
      recipientName: value.recipient.trim(),
      line1: value.street.trim(),
      line2: value.building.trim() === '' ? null : value.building.trim(),
      city: value.city.trim(),
      region: governorates.find((g) => g.ar === value.governorate)?.en ?? value.governorate,
      postalCode: value.postal.trim() === '' ? null : value.postal.trim(),
      countryCode: 'EG',
      phone: `+20 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`,
    };
    setSaving(true);
    setSaveError(null);
    try {
      const created = await api.post<ApiCustomerAddress>('customers/me/addresses', input);
      setShowForm(false);
      setValue(blankAddress);
      onCreated(created.id);
    } catch (error) {
      setSaveError(errorMessage(error, 'We couldn’t save the address. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      data-reveal="fade"
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      lang={lang === 'ar' ? 'ar' : 'en'}
      className={`${styles.section} ${lang === 'ar' ? styles.arTheme : ''}`}
    >
      <h2 className={`${styles.sectionTitle} ${lang === 'ar' ? styles.headlineAr : ''}`}>
        {copy.title}
      </h2>
      <p className={styles.sectionIntro}>{copy.intro}</p>

      {addresses.status === 'loading' || addresses.status === 'idle' ? (
        <p className={styles.sectionIntro} role="status">
          {copy.loading}
        </p>
      ) : null}
      {addresses.status === 'error' ? (
        <p className={styles.fieldError} role="alert">
          <Icon name="alert" size={13} strokeWidth={2} stroke="#a1362b" />
          {addresses.message}{' '}
          <button type="button" className={styles.stepRowEdit} onClick={onRetry}>
            {copy.retry}
          </button>
        </p>
      ) : null}
      {addresses.status === 'ready' && list.length === 0 ? (
        <p className={styles.sectionIntro}>{copy.none}</p>
      ) : null}

      {list.length > 0 ? (
        <ul className={styles.addressList}>
          {list.map((address) => {
            const selected = address.id === selectedAddressId;
            const sep = lang === 'ar' ? '، ' : ', ';
            const region =
              lang === 'ar'
                ? (governorates.find((g) => g.en === address.region)?.ar ?? address.region)
                : address.region;
            return (
              <li
                key={address.id}
                className={styles.addressCard}
                onClick={() => onSelect(address.id)}
              >
                <input
                  type="radio"
                  name="checkout-address"
                  checked={selected}
                  onChange={() => onSelect(address.id)}
                  className={styles.addressRadio}
                  aria-label={`${address.recipientName}, ${address.line1}`}
                />
                <div className={styles.addressBody}>
                  <span className={styles.addressLabel}>{address.recipientName}</span>
                  {address.isDefault ? (
                    <span className={styles.addressDefaultPill}>{copy.defaultPill}</span>
                  ) : null}
                  <span className={styles.addressLines}>
                    {address.line1}
                    {address.line2 !== null ? `${sep}${address.line2}` : ''}
                    <br />
                    {address.city}
                    {region !== null ? `${sep}${region}` : ''} {address.postalCode ?? ''}
                    <br />
                    {address.phone !== null ? (
                      <span dir="ltr" className={styles.numerals}>
                        {address.phone}
                      </span>
                    ) : null}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {addresses.status === 'ready' && list.length > 0 && selectedAddressId === null ? (
        <p className={styles.fieldError} role="alert">
          <Icon name="alert" size={13} strokeWidth={2} stroke="#a1362b" />
          {copy.errSelect}
        </p>
      ) : null}

      <button type="button" className={styles.addAddressBtn} onClick={() => setShowForm((s) => !s)}>
        <Icon name="plus" size={16} strokeWidth={2} /> {copy.add}
      </button>

      {showForm ? (
        <form
          className={styles.section}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void addAddress();
          }}
        >
          <h3 className={styles.sectionTitle}>{copy.formTitle}</h3>
          <p className={styles.sectionIntro}>
            {copy.required} {copy.savedNote}
          </p>
          <TextField
            id="recipient"
            label={copy.fields.recipient}
            value={value}
            onChange={setValue}
            errors={errors}
          />
          <div className={styles.twoCol}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="addr-phone">
                {copy.fields.phone}
              </label>
              <div className={styles.phoneRow}>
                <span className={styles.countryChip} aria-label="+20">
                  +20
                </span>
                <input
                  id="addr-phone"
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  className={`${styles.textField} ${styles.phoneField} ${errors.phone !== undefined ? styles.textFieldInvalid : ''}`}
                  value={value.phone}
                  onChange={(e) => setValue({ ...value, phone: e.target.value })}
                />
              </div>
              {errors.phone !== undefined ? (
                <span className={styles.fieldError}>
                  <Icon name="alert" size={13} strokeWidth={2} stroke="#a1362b" />
                  {errors.phone}
                </span>
              ) : null}
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="addr-postal">
                {copy.fields.postal} <span className={styles.fieldLabelMuted}>{copy.optional}</span>
              </label>
              <input
                id="addr-postal"
                type="text"
                inputMode="numeric"
                dir="ltr"
                className={`${styles.textField} ${styles.numerals} ${errors.postal !== undefined ? styles.textFieldInvalid : ''}`}
                value={value.postal}
                onChange={(e) => setValue({ ...value, postal: e.target.value })}
              />
              {errors.postal !== undefined ? (
                <span className={styles.fieldError}>
                  <Icon name="alert" size={13} strokeWidth={2} stroke="#a1362b" />
                  {errors.postal}
                </span>
              ) : null}
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="addr-governorate">
              {copy.fields.governorate}
            </label>
            <select
              id="addr-governorate"
              className={`${styles.textField} ${errors.governorate !== undefined ? styles.textFieldInvalid : ''}`}
              value={value.governorate}
              onChange={(e) => setValue({ ...value, governorate: e.target.value })}
            >
              <option value="">{copy.fields.governorate}</option>
              {governorates.map((g) => (
                <option key={g.en} value={lang === 'ar' ? g.ar : g.en}>
                  {lang === 'ar' ? g.ar : g.en}
                </option>
              ))}
            </select>
            {errors.governorate !== undefined ? (
              <span className={styles.fieldError}>
                <Icon name="alert" size={13} strokeWidth={2} stroke="#a1362b" />
                {errors.governorate}
              </span>
            ) : null}
          </div>
          <TextField
            id="city"
            label={copy.fields.city}
            value={value}
            onChange={setValue}
            errors={errors}
          />
          <TextField
            id="street"
            label={copy.fields.street}
            value={value}
            onChange={setValue}
            errors={errors}
          />
          <TextField
            id="building"
            label={`${copy.fields.building} ${copy.optional}`}
            value={value}
            onChange={setValue}
            errors={errors}
          />
          {saveError !== null ? (
            <p className={styles.fieldError} role="alert">
              <Icon name="alert" size={13} strokeWidth={2} stroke="#a1362b" />
              {saveError}
            </p>
          ) : null}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.btnOutline}
              onClick={() => setShowForm(false)}
              disabled={saving}
            >
              {copy.cancel}
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={saving}>
              {saving ? copy.saving : copy.save}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  errors,
}: {
  id: keyof NewAddress;
  label: string;
  value: NewAddress;
  onChange: (next: NewAddress) => void;
  errors: Record<string, string>;
}) {
  const error = errors[id];
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor={`addr-${id}`}>
        {label}
      </label>
      <input
        id={`addr-${id}`}
        type="text"
        className={`${styles.textField} ${error !== undefined ? styles.textFieldInvalid : ''}`}
        value={value[id]}
        onChange={(e) => onChange({ ...value, [id]: e.target.value })}
      />
      {error !== undefined ? (
        <span className={styles.fieldError}>
          <Icon name="alert" size={13} strokeWidth={2} stroke="#a1362b" />
          {error}
        </span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Step 2 — Shipping method (the store's configured options)
 * ------------------------------------------------------------------ */

const SHIPPING_COPY = {
  en: {
    title: 'Shipping method',
    intro: 'Choose how your order should be delivered.',
    loading: 'Loading delivery options…',
    none: 'There are no delivery options for this address’s country yet, so this order can’t be placed. Choose another address.',
    noCharge: 'No charge',
    notCollected:
      'Delivery charges aren’t collected online yet, so your order total doesn’t include delivery. No delivery date is promised until your order ships.',
    test: 'Test configuration — this store is running in a test environment.',
    retry: 'Try again',
  },
  ar: {
    title: 'طريقة الشحن', // *
    intro: 'اختر طريقة توصيل طلبك.', // *
    loading: 'جارٍ تحميل خيارات التوصيل…', // *
    none: 'لا توجد خيارات توصيل لدولة هذا العنوان بعد، لذا لا يمكن إتمام الطلب. اختر عنواناً آخر.', // *
    noCharge: 'بدون رسوم', // *
    notCollected: 'لا تُحصَّل رسوم التوصيل عبر الإنترنت بعد، لذا لا يشملها إجمالي طلبك.', // *
    test: 'إعدادات تجريبية — المتجر يعمل في بيئة اختبار.', // *
    retry: 'حاول مرة أخرى', // *
  },
};

function ShippingStep({
  lang,
  shipping,
  selectedCode,
  onSelect,
  onRetry,
}: {
  lang: AccountLang;
  shipping: Loadable<ApiShippingOptions>;
  selectedCode: string | null;
  onSelect: (code: string) => void;
  onRetry: () => void;
}) {
  const c = SHIPPING_COPY[lang];
  return (
    <section
      data-reveal="fade"
      className={`${styles.section} ${lang === 'ar' ? styles.arTheme : ''}`}
    >
      <h2 className={styles.sectionTitle}>{c.title}</h2>
      <p className={styles.sectionIntro}>{c.intro}</p>
      {shipping.status === 'loading' || shipping.status === 'idle' ? (
        <p className={styles.sectionIntro} role="status">
          {c.loading}
        </p>
      ) : null}
      {shipping.status === 'error' ? (
        <p className={styles.fieldError} role="alert">
          <Icon name="alert" size={13} strokeWidth={2} stroke="#a1362b" />
          {shipping.message}{' '}
          <button type="button" className={styles.stepRowEdit} onClick={onRetry}>
            {c.retry}
          </button>
        </p>
      ) : null}
      {shipping.status === 'ready' && shipping.data.options.length === 0 ? (
        <p className={styles.fieldError} role="alert">
          <Icon name="alert" size={13} strokeWidth={2} stroke="#a1362b" />
          {c.none}
        </p>
      ) : null}
      {shipping.status === 'ready' && shipping.data.options.length > 0 ? (
        <>
          <ul className={styles.radioList}>
            {shipping.data.options.map((option) => (
              <li key={option.code} className={styles.radioItem}>
                <input
                  type="radio"
                  name="shipping-method"
                  checked={option.code === selectedCode}
                  onChange={() => onSelect(option.code)}
                  aria-label={option.label}
                />
                <div>
                  <span className={styles.radioLabel}>{option.label}</span>
                </div>
                <bdi className={styles.radioPrice}>
                  {option.amountMinor === 0
                    ? c.noCharge
                    : money(option.amountMinor, option.currency)}
                </bdi>
              </li>
            ))}
          </ul>
          {!shipping.data.chargeCollected ? (
            <p className={styles.fieldHelp}>{c.notCollected}</p>
          ) : null}
          {shipping.data.environment === 'TEST' ? (
            <p className={styles.fieldHelp}>{c.test}</p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Step 3 — Payment (what the backend supports)
 * ------------------------------------------------------------------ */

const PAYMENT_COPY = {
  en: {
    title: 'Payment method',
    intro:
      'You pay after the order is placed, from the order page. Your items are held for you while payment is pending.',
    testLabel: 'Test payment',
    testDesc:
      'This store runs with a non-production test payment provider: no card details are asked for and no real money moves. A test payment stays pending until the provider confirms it.',
    liveLabel: 'Online payment',
    liveDesc:
      'Online payment isn’t available yet. You can place the order; it waits for payment and is released if unpaid.',
  },
  ar: {
    title: 'طريقة الدفع', // *
    intro: 'تدفع بعد إتمام الطلب من صفحة الطلب. نحجز منتجاتك أثناء انتظار الدفع.', // *
    testLabel: 'دفع تجريبي', // *
    testDesc: 'يعمل المتجر بمزوّد دفع تجريبي: لا تُطلب بيانات بطاقة ولا تُنقل أموال حقيقية.', // *
    liveLabel: 'الدفع عبر الإنترنت', // *
    liveDesc: 'الدفع عبر الإنترنت غير متاح بعد.', // *
  },
};

function PaymentStep({
  lang,
  environment,
}: {
  lang: AccountLang;
  environment: 'TEST' | 'PRODUCTION' | null;
}) {
  const c = PAYMENT_COPY[lang];
  const test = environment === 'TEST';
  return (
    <section
      data-reveal="fade"
      className={`${styles.section} ${lang === 'ar' ? styles.arTheme : ''}`}
    >
      <h2 className={styles.sectionTitle}>{c.title}</h2>
      <p className={styles.sectionIntro}>{c.intro}</p>
      <ul className={styles.radioList}>
        <li className={styles.radioItem}>
          <input
            type="radio"
            name="payment-method"
            checked
            readOnly
            aria-label={test ? c.testLabel : c.liveLabel}
          />
          <div>
            <span className={styles.radioLabel}>{test ? c.testLabel : c.liveLabel}</span>
            <span className={styles.radioDesc}>{test ? c.testDesc : c.liveDesc}</span>
          </div>
        </li>
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Step 4 — Review (the server's quote) & place order
 * ------------------------------------------------------------------ */

const REVIEW_COPY = {
  en: {
    title: 'Review & place order',
    intro:
      'These are the store’s own figures for your cart and destination. Placing the order holds your items while you pay.',
    address: 'Delivery address',
    shipping: 'Shipping',
    items: 'Items',
    loading: 'Calculating your total…',
    retry: 'Recalculate',
    blocked: 'This order can’t be placed yet',
    priceChanged: 'Price updated since you added it',
    addressNote:
      'For now the store saves only the destination country with your order; the delivery address and method shown here aren’t stored with it yet.',
  },
  ar: {
    title: 'راجع طلبك',
    intro: 'هذه أرقام المتجر لسلتك ووجهتك. إتمام الطلب يحجز منتجاتك أثناء الدفع.', // *
    address: 'عنوان التوصيل',
    shipping: 'الشحن',
    items: 'المنتجات', // *
    loading: 'جارٍ حساب الإجمالي…', // *
    retry: 'إعادة الحساب', // *
    blocked: 'لا يمكن إتمام هذا الطلب بعد', // *
    priceChanged: 'تغيّر السعر منذ إضافته', // *
    addressNote:
      'يحفظ المتجر حالياً دولة الوجهة فقط مع طلبك؛ ولا يُحفظ العنوان وطريقة التوصيل معه بعد.', // *
  },
};

function ReviewStep({
  lang,
  address,
  shippingOptions,
  shippingLabel,
  quote,
  lines,
  onRetry,
}: {
  lang: AccountLang;
  address: ApiCustomerAddress | null;
  shippingOptions: ApiShippingOptions | null;
  shippingLabel: string | null;
  quote: Loadable<ApiCheckoutQuote>;
  lines: ResolvedCartLine[];
  onRetry: () => void;
}) {
  const c = REVIEW_COPY[lang];
  const byLine = new Map(lines.map((line) => [line.item.key, line]));
  return (
    <section
      className={`${styles.section} ${lang === 'ar' ? styles.arTheme : ''}`}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      lang={lang === 'ar' ? 'ar' : 'en'}
    >
      <h2 className={styles.sectionTitle}>{c.title}</h2>
      <p className={styles.sectionIntro}>{c.intro}</p>

      <div className={styles.twoCol}>
        <div className={styles.field}>
          <h3 className={styles.sectionTitle}>{c.address}</h3>
          {address !== null ? (
            <div className={styles.addressLines}>
              <span className={styles.addressLabel}>{address.recipientName}</span>
              <br />
              {address.line1}
              {address.line2 !== null ? `, ${address.line2}` : ''}
              <br />
              {address.city}
              {address.region !== null ? `, ${address.region}` : ''} {address.postalCode ?? ''}
              <br />
              {address.phone !== null ? (
                <span dir="ltr" className={styles.numerals}>
                  {address.phone}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className={styles.field}>
          <h3 className={styles.sectionTitle}>{c.shipping}</h3>
          <span className={styles.radioLabel}>{shippingLabel ?? '—'}</span>
          {shippingOptions !== null && !shippingOptions.chargeCollected ? (
            <span className={styles.radioDesc}>{SHIPPING_COPY[lang].notCollected}</span>
          ) : null}
        </div>
      </div>
      <p className={styles.fieldHelp}>{c.addressNote}</p>

      <div style={{ marginTop: 20 }}>
        <h3 className={styles.sectionTitle}>{c.items}</h3>
        {quote.status === 'loading' || quote.status === 'idle' ? (
          <p className={styles.sectionIntro} role="status">
            {c.loading}
          </p>
        ) : null}
        {quote.status === 'error' ? (
          <p className={styles.fieldError} role="alert">
            <Icon name="alert" size={13} strokeWidth={2} stroke="#a1362b" />
            {quote.message}{' '}
            <button type="button" className={styles.stepRowEdit} onClick={onRetry}>
              {c.retry}
            </button>
          </p>
        ) : null}
        {quote.status === 'ready' ? (
          <>
            {quote.data.blockers.length > 0 ? (
              <div className={styles.demoAlert} role="alert">
                <Icon name="alert" size={18} strokeWidth={2} stroke="#a1362b" aria-hidden="true" />
                <div>
                  <strong>{c.blocked}</strong>
                  <ul style={{ margin: '4px 0 0', paddingInlineStart: 18 }}>
                    {quote.data.blockers.map((blocker, index) => (
                      <li key={`${blocker.code}-${blocker.lineId ?? index}`}>
                        {blockerMessage(blocker)}
                      </li>
                    ))}
                  </ul>
                  <p style={{ margin: '6px 0 0' }}>
                    <Link href="/cart">Edit your cart</Link>
                  </p>
                </div>
              </div>
            ) : null}
            <ul className={styles.summaryItems}>
              {quote.data.lines.map((line) => {
                const cart = byLine.get(line.lineId);
                return (
                  <li key={line.lineId} className={styles.summaryItem}>
                    {cart !== undefined ? (
                      <span className={styles.summaryItemImage}>
                        <StorefrontImage image={cart.item.image} alt="" fill sizes="64px" />
                      </span>
                    ) : null}
                    <div className={styles.summaryItemBody}>
                      <span className={styles.summaryItemName}>{line.productName}</span>
                      <span className={styles.summaryItemVariant}>
                        <bdi>{cart?.item.variant ?? ''}</bdi> · <bdi>SKU {line.sku}</bdi>
                      </span>
                      {line.priceChanged ? (
                        <span className={styles.summaryItemVariant}>{c.priceChanged}</span>
                      ) : null}
                    </div>
                    <bdi className={styles.summaryItemQtyPrice}>
                      {line.quantity} × {money(line.unitPriceMinor, line.unitCurrency)}
                    </bdi>
                    <bdi className={styles.summaryItemQtyPrice}>
                      {money(line.totalMinor, line.unitCurrency)}
                    </bdi>
                  </li>
                );
              })}
            </ul>
            <QuoteTotals quote={quote.data} lang={lang} />
          </>
        ) : null}
      </div>

      <p className={styles.summaryNote}>
        By placing your order you agree to our{' '}
        <Link href="/dev/placeholder?for=Terms%20of%20sale">Terms of sale</Link> and confirm you’ve
        read our <Link href="/dev/placeholder?for=Privacy">Privacy notice</Link>. Return eligibility
        is shown per item on each product page.
      </p>
    </section>
  );
}
