import { describe, expect, it } from 'vitest';
import { egp, formatMoney, formatSaving } from './money';

describe('formatMoney', () => {
  it('shows whole Egyptian pounds without decimals, the way the approved boards do', () => {
    expect(formatMoney(egp(4850))).toBe('EGP 4,850');
    expect(formatMoney(egp(6200))).toBe('EGP 6,200');
    expect(formatMoney(egp(380))).toBe('EGP 380');
  });

  it('keeps the amount exact in minor units', () => {
    expect(egp(4850)).toEqual({ amountMinor: 485000, currency: 'EGP' });
    expect(formatMoney({ amountMinor: 1, currency: 'EGP' })).toBe('EGP 0.01');
  });

  it('can omit the currency code', () => {
    expect(formatMoney(egp(5700), { withCurrency: false })).toBe('5,700');
  });
});

describe('formatSaving', () => {
  it('describes the difference between the previous and the effective price', () => {
    expect(formatSaving({ amountMinor: 85000, currency: 'EGP' })).toBe('Save EGP 850');
  });
});
