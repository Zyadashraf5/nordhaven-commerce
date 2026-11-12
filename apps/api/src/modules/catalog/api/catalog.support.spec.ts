import {
  buildCategoryTree,
  decodeProductCursor,
  encodeProductCursor,
  isFreeOfControlCharacters,
  normalizeSearchTerm,
  parseAttributeFilter,
  slugify,
} from './catalog.support';
import type { CategoryRecord } from '../persistence/category.repository';

const NOW = new Date('2026-10-20T10:00:00.000Z');

function category(id: string, name: string, slug: string, parentId: string | null): CategoryRecord {
  return {
    id,
    name,
    slug,
    parentId,
    position: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe('catalog support', () => {
  describe('slugify', () => {
    it('produces a lower kebab-case body from free text', () => {
      expect(slugify('  Oak Dining Table ')).toBe('oak-dining-table');
      expect(slugify('Café / Bar Stool!')).toBe('cafe-bar-stool');
      expect(slugify('Item  2---Pack')).toBe('item-2-pack');
    });

    it('returns null when nothing usable remains', () => {
      expect(slugify('!!!')).toBeNull();
      expect(slugify('   ')).toBeNull();
    });
  });

  describe('isFreeOfControlCharacters', () => {
    it('accepts printable text and rejects the control range', () => {
      expect(isFreeOfControlCharacters('Solid oak')).toBe(true);
      expect(isFreeOfControlCharacters(`oak${String.fromCharCode(0x1f)}table`)).toBe(false);
      expect(isFreeOfControlCharacters(`oak${String.fromCharCode(0x7f)}table`)).toBe(false);
    });
  });

  describe('product cursor', () => {
    it('round-trips a position', () => {
      const position = { name: 'Oak Table', id: '2f1e0d9c-8b7a-4695-8432-1f0e9d8c7b6a' };
      expect(decodeProductCursor(encodeProductCursor(position))).toEqual(position);
    });

    it('treats unreadable input as absent rather than throwing', () => {
      expect(decodeProductCursor('not-base64!!')).toBeNull();
      expect(
        decodeProductCursor(Buffer.from('no-separator', 'utf8').toString('base64url')),
      ).toBeNull();
      expect(
        decodeProductCursor(Buffer.from('name\u0000not-a-uuid', 'utf8').toString('base64url')),
      ).toBeNull();
    });
  });

  describe('buildCategoryTree', () => {
    it('groups children beneath their root in order', () => {
      const records = [
        category('r1', 'Furniture', 'furniture', null),
        category('c1', 'Chairs', 'chairs', 'r1'),
        category('r2', 'Lighting', 'lighting', null),
        category('c2', 'Lamps', 'lamps', 'r1'),
      ];
      const tree = buildCategoryTree(records);
      expect(tree.map((node) => node.id)).toEqual(['r1', 'r2']);
      expect(tree[0]?.children.map((child) => child.id)).toEqual(['c1', 'c2']);
      expect(tree[1]?.children).toEqual([]);
    });

    it('surfaces a node whose parent is absent instead of dropping it', () => {
      const records = [category('c1', 'Chairs', 'chairs', 'missing')];
      expect(buildCategoryTree(records).map((node) => node.id)).toEqual(['c1']);
    });
  });

  describe('normalizeSearchTerm', () => {
    it('trims and collapses interior whitespace', () => {
      expect(normalizeSearchTerm('  oak   dining  table ')).toBe('oak dining table');
    });

    it('keeps a term that contains at least one alphanumeric character', () => {
      expect(normalizeSearchTerm('oak')).toBe('oak');
      expect(normalizeSearchTerm('size 3')).toBe('size 3');
    });

    it('returns null for a term with nothing usable in it', () => {
      expect(normalizeSearchTerm('')).toBeNull();
      expect(normalizeSearchTerm('   ')).toBeNull();
      expect(normalizeSearchTerm('!!!')).toBeNull();
      expect(normalizeSearchTerm(' - ')).toBeNull();
    });
  });

  describe('parseAttributeFilter', () => {
    it('splits on the first colon so a value may contain colons', () => {
      expect(parseAttributeFilter('color:blue')).toEqual({ name: 'color', value: 'blue' });
      expect(parseAttributeFilter('size:10 x 20:cm')).toEqual({
        name: 'size',
        value: '10 x 20:cm',
      });
    });

    it('trims the name and the value', () => {
      expect(parseAttributeFilter(' color : blue ')).toEqual({ name: 'color', value: 'blue' });
    });

    it('returns null when either side is missing', () => {
      expect(parseAttributeFilter('color')).toBeNull();
      expect(parseAttributeFilter('color:')).toBeNull();
      expect(parseAttributeFilter(':blue')).toBeNull();
      expect(parseAttributeFilter('')).toBeNull();
    });
  });
});

describe('international search normalization', () => {
  it('collapses spacing for non-ASCII terms consistently with ASCII search', () => {
    expect(normalizeSearchTerm('  طاولة   خشب  ')).toBe('طاولة خشب');
    expect(normalizeSearchTerm('  椅子  ')).toBe('椅子');
  });
});
