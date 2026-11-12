import {
  ADDRESS_LINE_MAX_LENGTH,
  ADDRESS_RECIPIENT_NAME_MAX_LENGTH,
  CONTACT_PHONE_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  countryCode,
  optionalText,
  requiredText,
} from './customer.support';

const DEL = String.fromCharCode(0x7f);
const BELL = String.fromCharCode(0x07);

describe('customer value rules', () => {
  describe('requiredText', () => {
    it('trims a bounded value', () => {
      expect(requiredText(10).safeParse('  Ada  ')).toMatchObject({ success: true, data: 'Ada' });
    });

    it('accepts non-ASCII characters and preserves them', () => {
      expect(requiredText(20).safeParse('  Ólafur Sigurðsson  ')).toMatchObject({
        success: true,
        data: 'Ólafur Sigurðsson',
      });
    });

    it('rejects an empty or whitespace-only value', () => {
      expect(requiredText(10).safeParse('').success).toBe(false);
      expect(requiredText(10).safeParse('    ').success).toBe(false);
    });

    it('accepts a value exactly at the bound and rejects one beyond it', () => {
      expect(requiredText(4).safeParse('abcd').success).toBe(true);
      expect(requiredText(4).safeParse('abcde').success).toBe(false);
    });

    it('rejects a value carrying a control character', () => {
      expect(requiredText(20).safeParse(`A${BELL}B`).success).toBe(false);
      expect(requiredText(20).safeParse(`A${DEL}B`).success).toBe(false);
      expect(requiredText(20).safeParse(`A${String.fromCharCode(0x1f)}B`).success).toBe(false);
    });

    it('rejects a non-string value', () => {
      expect(requiredText(10).safeParse(42).success).toBe(false);
    });
  });

  describe('optionalText', () => {
    it('trims and keeps a supplied value', () => {
      expect(optionalText(10).safeParse('  Ada  ')).toMatchObject({ success: true, data: 'Ada' });
    });

    it('stores an empty or whitespace-only value as not provided', () => {
      expect(optionalText(10).safeParse('')).toMatchObject({ success: true, data: null });
      expect(optionalText(10).safeParse('   ')).toMatchObject({ success: true, data: null });
    });

    it('rejects an over-long value and a value carrying a control character', () => {
      expect(optionalText(4).safeParse('abcde').success).toBe(false);
      expect(optionalText(20).safeParse(`A${BELL}B`).success).toBe(false);
    });
  });

  describe('countryCode', () => {
    it('accepts two letters and normalizes to upper case', () => {
      expect(countryCode().safeParse('gb')).toMatchObject({ success: true, data: 'GB' });
      expect(countryCode().safeParse(' Us ')).toMatchObject({ success: true, data: 'US' });
    });

    it('accepts any shaped code, because the supported set is not restricted (HC-DEC-005 Open)', () => {
      expect(countryCode().safeParse('zz')).toMatchObject({ success: true, data: 'ZZ' });
    });

    it('rejects a value that is not exactly two ASCII letters', () => {
      expect(countryCode().safeParse('USA').success).toBe(false);
      expect(countryCode().safeParse('U1').success).toBe(false);
      expect(countryCode().safeParse('U').success).toBe(false);
      expect(countryCode().safeParse('').success).toBe(false);
    });
  });

  it('documents the bounds the schemas enforce', () => {
    expect(DISPLAY_NAME_MAX_LENGTH).toBe(120);
    expect(CONTACT_PHONE_MAX_LENGTH).toBe(32);
    expect(ADDRESS_RECIPIENT_NAME_MAX_LENGTH).toBe(120);
    expect(ADDRESS_LINE_MAX_LENGTH).toBe(200);
  });
});
