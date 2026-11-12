import type { CurrencyCode, Money } from './types';

/**
 * EGP is quoted in piastres (1/100 EGP), which keeps every amount an exact
 * integer — the same contract the catalog API uses for its minor units.
 */
const CURRENCY_DECIMALS: Record<CurrencyCode, number> = {
  EGP: 2,
};

const CURRENCY_LOCALE: Record<CurrencyCode, string> = {
  EGP: 'en-US',
};

export function egp(amount: number): Money {
  return { amountMinor: Math.round(amount * 100), currency: 'EGP' };
}

/** Formats an amount the way the approved boards show it: "EGP 4,850". */
export function formatMoney(money: Money, options?: { withCurrency?: boolean }): string {
  const decimals = CURRENCY_DECIMALS[money.currency];
  const major = money.amountMinor / 10 ** decimals;
  const formatted = new Intl.NumberFormat(CURRENCY_LOCALE[money.currency], {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(major);
  return options?.withCurrency === false ? formatted : `${money.currency} ${formatted}`;
}

/** "EGP 850" — the amount a buyer saves, used next to a struck-through price. */
export function formatSaving(saved: Money): string {
  return `Save ${formatMoney(saved)}`;
}
