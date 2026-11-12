import { MAX_CART_LINE_QUANTITY, MAX_CART_LINES, cartQuantity } from './cart.support';

describe('cart support', () => {
  describe('cartQuantity', () => {
    it('accepts a positive whole quantity within the maximum', () => {
      expect(cartQuantity().safeParse(1).success).toBe(true);
      expect(cartQuantity().safeParse(500).success).toBe(true);
      expect(cartQuantity().safeParse(MAX_CART_LINE_QUANTITY).success).toBe(true);
    });

    it('refuses a zero, negative, or fractional quantity', () => {
      expect(cartQuantity().safeParse(0).success).toBe(false);
      expect(cartQuantity().safeParse(-1).success).toBe(false);
      expect(cartQuantity().safeParse(1.5).success).toBe(false);
    });

    it('refuses a quantity beyond the per-line maximum', () => {
      expect(cartQuantity().safeParse(MAX_CART_LINE_QUANTITY + 1).success).toBe(false);
    });
  });

  it('declares a bounded per-line quantity and a bounded cart size', () => {
    expect(MAX_CART_LINE_QUANTITY).toBe(999);
    expect(MAX_CART_LINES).toBe(200);
  });
});
