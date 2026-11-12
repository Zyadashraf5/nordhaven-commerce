import {
  bundleAvailability,
  componentAffordable,
  decodeInventoryCursor,
  decodeTimeCursor,
  encodeInventoryCursor,
  encodeTimeCursor,
  isFreeOfControlCharacters,
  resolveBundleLines,
} from './inventory.support';

describe('inventory support', () => {
  describe('isFreeOfControlCharacters', () => {
    it('accepts printable text and rejects the control range', () => {
      expect(isFreeOfControlCharacters('Goods received')).toBe(true);
      expect(isFreeOfControlCharacters(`oak${String.fromCharCode(0x1f)}table`)).toBe(false);
      expect(isFreeOfControlCharacters(`oak${String.fromCharCode(0x7f)}table`)).toBe(false);
    });
  });

  describe('componentAffordable', () => {
    it('floors the whole-bundle count and never divides by zero', () => {
      expect(componentAffordable(10, 2)).toBe(5);
      expect(componentAffordable(9, 2)).toBe(4);
      expect(componentAffordable(1, 2)).toBe(0);
      expect(componentAffordable(10, 0)).toBe(0);
      expect(componentAffordable(10, -1)).toBe(0);
    });
  });

  describe('bundleAvailability', () => {
    it('is the minimum affordable count over every component', () => {
      // min(floor(4/1), floor(10/2)) = min(4, 5)
      expect(
        bundleAvailability([
          { available: 4, perBundleQuantity: 1 },
          { available: 10, perBundleQuantity: 2 },
        ]),
      ).toBe(4);
    });

    it('supports nothing for an empty composition', () => {
      expect(bundleAvailability([])).toBe(0);
    });

    it('supports nothing when any component is missing a per-bundle quantity', () => {
      expect(
        bundleAvailability([
          { available: 10, perBundleQuantity: 2 },
          { available: 10, perBundleQuantity: 0 },
        ]),
      ).toBe(0);
    });
  });

  describe('resolveBundleLines', () => {
    it('multiplies each component by the requested bundle count', () => {
      expect(
        resolveBundleLines(
          [
            { variantId: 'a', perBundleQuantity: 1 },
            { variantId: 'b', perBundleQuantity: 2 },
          ],
          3,
        ),
      ).toEqual([
        { variantId: 'a', quantity: 3 },
        { variantId: 'b', quantity: 6 },
      ]);
    });
  });

  describe('inventory cursor', () => {
    it('round-trips a position', () => {
      const position = { sku: 'OAK-TABLE-01', id: '2f1e0d9c-8b7a-4695-8432-1f0e9d8c7b6a' };
      expect(decodeInventoryCursor(encodeInventoryCursor(position))).toEqual(position);
    });

    it('treats unreadable input as absent rather than throwing', () => {
      expect(decodeInventoryCursor('not-base64!!')).toBeNull();
      expect(
        decodeInventoryCursor(Buffer.from('no-separator', 'utf8').toString('base64url')),
      ).toBeNull();
      expect(
        decodeInventoryCursor(Buffer.from('sku\u0000not-a-uuid', 'utf8').toString('base64url')),
      ).toBeNull();
    });
  });

  describe('time cursor', () => {
    it('round-trips a position', () => {
      const position = {
        timestamp: '2026-10-20T10:00:00.000Z',
        id: '2f1e0d9c-8b7a-4695-8432-1f0e9d8c7b6a',
      };
      expect(decodeTimeCursor(encodeTimeCursor(position))).toEqual(position);
    });

    it('treats an unreadable timestamp or identifier as absent', () => {
      expect(
        decodeTimeCursor(Buffer.from('not-a-date\u0000bad', 'utf8').toString('base64url')),
      ).toBeNull();
      expect(decodeTimeCursor('not-base64!!')).toBeNull();
    });
  });
  it('rejects UUID-shaped character strings lacking UUID structure in both cursor kinds', () => {
    const malformedId = '-'.repeat(36);
    expect(
      decodeInventoryCursor(encodeInventoryCursor({ sku: 'SKU', id: malformedId })),
    ).toBeNull();
    expect(
      decodeTimeCursor(encodeTimeCursor({ timestamp: new Date().toISOString(), id: malformedId })),
    ).toBeNull();
  });
});
