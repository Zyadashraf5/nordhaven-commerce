import type { ZodType } from 'zod';
import { ZOD_VALIDATION_SCHEMA } from '../../../platform/validation/zod-validation.pipe';
import {
  CreateBrandRequest,
  CreateCategoryRequest,
  CreateProductRequest,
  CreateProductVariantRequest,
  ListProductsQuery,
  ProductSlugParam,
  ReplaceProductAttributesRequest,
  ReplaceProductImagesRequest,
  SearchProductsQuery,
  SetProductDiscountRequest,
  SetProductStatusRequest,
  UpdateProductRequest,
  UpdateProductVariantRequest,
} from './catalog.request';

const CATEGORY_ID = '2f1e0d9c-8b7a-4695-8432-1f0e9d8c7b6a';
const BRAND_ID = '3f1e0d9c-8b7a-4695-8432-1f0e9d8c7b6b';

interface SchemaHolder {
  readonly [ZOD_VALIDATION_SCHEMA]: ZodType;
}

/** Exercises the boundary schema the validation pipe actually uses. */
function parse(holder: SchemaHolder, value: unknown) {
  return holder[ZOD_VALIDATION_SCHEMA].safeParse(value);
}

describe('catalog request schemas', () => {
  describe('CreateCategoryRequest', () => {
    it('accepts a root category and derives nothing when the slug is omitted', () => {
      expect(parse(CreateCategoryRequest, { name: '  Furniture ' })).toMatchObject({
        success: true,
        data: { name: 'Furniture' },
      });
    });

    it('normalizes an explicit slug', () => {
      expect(
        parse(CreateCategoryRequest, { name: 'Furniture', slug: '  Living Room ' }),
      ).toMatchObject({ success: true, data: { slug: 'living-room' } });
    });

    it('rejects an unknown field, a negative position, and a name that cannot yield a slug', () => {
      expect(parse(CreateCategoryRequest, { name: 'Furniture', depth: 1 }).success).toBe(false);
      expect(parse(CreateCategoryRequest, { name: 'Furniture', position: -1 }).success).toBe(false);
      expect(parse(CreateCategoryRequest, { name: '!!!' }).success).toBe(false);
    });
  });

  describe('CreateProductRequest', () => {
    const minimal = {
      name: 'Oak Dining Table',
      description: 'Solid oak dining table.',
      categoryId: CATEGORY_ID,
      brandId: BRAND_ID,
      basePriceMinor: 129900,
      baseCurrency: 'gbp',
    };

    it('accepts an exact integer price and normalizes the currency', () => {
      expect(parse(CreateProductRequest, minimal)).toMatchObject({
        success: true,
        data: { basePriceMinor: 129900, baseCurrency: 'GBP' },
      });
    });

    it('rejects a fractional price, a negative price, an unknown currency shape, and a client status', () => {
      expect(parse(CreateProductRequest, { ...minimal, basePriceMinor: 1299.5 }).success).toBe(
        false,
      );
      expect(parse(CreateProductRequest, { ...minimal, basePriceMinor: -1 }).success).toBe(false);
      expect(parse(CreateProductRequest, { ...minimal, baseCurrency: 'POUNDS' }).success).toBe(
        false,
      );
      expect(parse(CreateProductRequest, { ...minimal, status: 'PUBLISHED' }).success).toBe(false);
    });

    it('rejects a missing required attribute and an unknown field', () => {
      expect(parse(CreateProductRequest, { ...minimal, categoryId: undefined }).success).toBe(
        false,
      );
      expect(parse(CreateProductRequest, { ...minimal, inventory: 10 }).success).toBe(false);
    });
  });

  describe('UpdateProductRequest', () => {
    it('accepts a partial update', () => {
      expect(parse(UpdateProductRequest, { basePriceMinor: 999 })).toMatchObject({
        success: true,
        data: { basePriceMinor: 999 },
      });
    });

    it('rejects an empty body and a client-supplied status', () => {
      expect(parse(UpdateProductRequest, {}).success).toBe(false);
      expect(parse(UpdateProductRequest, { status: 'PUBLISHED' }).success).toBe(false);
    });
  });

  describe('ReplaceProductImagesRequest', () => {
    it('accepts an ordered image set and rejects duplicate positions', () => {
      expect(
        parse(ReplaceProductImagesRequest, {
          images: [
            { url: 'https://cdn.example.com/a.jpg', position: 0 },
            { url: 'https://cdn.example.com/b.jpg', position: 1, altText: 'Side view' },
          ],
        }).success,
      ).toBe(true);
      expect(
        parse(ReplaceProductImagesRequest, {
          images: [
            { url: 'https://cdn.example.com/a.jpg', position: 0 },
            { url: 'https://cdn.example.com/b.jpg', position: 0 },
          ],
        }).success,
      ).toBe(false);
    });

    it('rejects a non-http URL and an unknown field', () => {
      expect(
        parse(ReplaceProductImagesRequest, { images: [{ url: 'ftp://files', position: 0 }] })
          .success,
      ).toBe(false);
      expect(
        parse(ReplaceProductImagesRequest, {
          images: [{ url: 'https://cdn.example.com/a.jpg', position: 0, bytes: 12 }],
        }).success,
      ).toBe(false);
    });

    it('accepts an empty set, which clears the collection', () => {
      expect(parse(ReplaceProductImagesRequest, { images: [] }).success).toBe(true);
    });
  });

  describe('ReplaceProductAttributesRequest', () => {
    it('rejects duplicate attribute names regardless of casing', () => {
      expect(
        parse(ReplaceProductAttributesRequest, {
          attributes: [
            { name: 'Material', value: 'Oak', position: 0 },
            { name: 'material', value: 'Pine', position: 1 },
          ],
        }).success,
      ).toBe(false);
    });
  });

  describe('SetProductStatusRequest', () => {
    it('accepts only the three lifecycle values', () => {
      expect(parse(SetProductStatusRequest, { status: 'PUBLISHED' }).success).toBe(true);
      expect(parse(SetProductStatusRequest, { status: 'DELETED' }).success).toBe(false);
    });
  });

  describe('CreateProductVariantRequest', () => {
    it('accepts a SKU-only variant and normalizes the SKU', () => {
      expect(parse(CreateProductVariantRequest, { sku: ' oak-table-01 ' })).toMatchObject({
        success: true,
        data: { sku: 'OAK-TABLE-01' },
      });
    });

    it('rejects a SKU with a disallowed character', () => {
      expect(parse(CreateProductVariantRequest, { sku: 'OAK TABLE' }).success).toBe(false);
      expect(parse(CreateProductVariantRequest, { sku: '-OAK' }).success).toBe(false);
    });
  });

  describe('UpdateProductVariantRequest', () => {
    it('accepts a clear of a dimension and rejects an empty body', () => {
      expect(parse(UpdateProductVariantRequest, { color: null })).toMatchObject({
        success: true,
        data: { color: null },
      });
      expect(parse(UpdateProductVariantRequest, {}).success).toBe(false);
    });
  });

  describe('CreateBrandRequest', () => {
    it('accepts a name and rejects an unknown field', () => {
      expect(parse(CreateBrandRequest, { name: ' Northwind ' })).toMatchObject({
        success: true,
        data: { name: 'Northwind' },
      });
      expect(parse(CreateBrandRequest, { name: 'Northwind', logo: 'x' }).success).toBe(false);
    });
  });

  describe('ListProductsQuery', () => {
    it('coerces the limit and leaves an absent cursor absent', () => {
      expect(parse(ListProductsQuery, { limit: '10' })).toMatchObject({
        success: true,
        data: { limit: 10 },
      });
      expect(parse(ListProductsQuery, {})).toMatchObject({ success: true, data: {} });
    });

    it('rejects an unbounded limit, a zero limit, and an unknown query parameter', () => {
      expect(parse(ListProductsQuery, { limit: '500' }).success).toBe(false);
      expect(parse(ListProductsQuery, { limit: '0' }).success).toBe(false);
      expect(parse(ListProductsQuery, { search: 'oak' }).success).toBe(false);
    });
  });

  describe('ProductSlugParam', () => {
    it('accepts a slug and rejects anything that is not one', () => {
      expect(parse(ProductSlugParam, { slug: 'oak-dining-table' }).success).toBe(true);
      expect(parse(ProductSlugParam, { slug: 'Oak Table' }).success).toBe(false);
      expect(parse(ProductSlugParam, { slug: 'oak', extra: true }).success).toBe(false);
    });
  });

  describe('SearchProductsQuery', () => {
    it('accepts an empty query, which is the unfiltered page', () => {
      expect(parse(SearchProductsQuery, {})).toMatchObject({ success: true, data: {} });
    });

    it('coerces the limit, the search term, and the price bounds', () => {
      expect(
        parse(SearchProductsQuery, {
          limit: '10',
          q: '  oak  ',
          minPrice: '1000',
          currency: 'GBP',
        }),
      ).toMatchObject({
        success: true,
        data: { limit: 10, q: 'oak', minPrice: 1000, currency: 'GBP' },
      });
    });

    it('normalizes the currency to upper case', () => {
      expect(parse(SearchProductsQuery, { minPrice: 1000, currency: 'gbp' })).toMatchObject({
        success: true,
        data: { currency: 'GBP' },
      });
    });

    it('accepts one attribute filter and a repeated attribute filter', () => {
      expect(parse(SearchProductsQuery, { attribute: 'color:blue' })).toMatchObject({
        success: true,
        data: { attribute: ['color:blue'] },
      });
      expect(
        parse(SearchProductsQuery, { attribute: ['color:blue', 'material:oak'] }),
      ).toMatchObject({ success: true, data: { attribute: ['color:blue', 'material:oak'] } });
    });

    it('refuses a price range without an explicit currency', () => {
      expect(parse(SearchProductsQuery, { minPrice: 1000 }).success).toBe(false);
      expect(parse(SearchProductsQuery, { maxPrice: 5000 }).success).toBe(false);
      expect(parse(SearchProductsQuery, { minPrice: 1000, currency: 'GBP' }).success).toBe(true);
    });

    it('refuses an inverted price range', () => {
      expect(
        parse(SearchProductsQuery, { minPrice: 5000, maxPrice: 1000, currency: 'GBP' }).success,
      ).toBe(false);
      expect(
        parse(SearchProductsQuery, { minPrice: 1000, maxPrice: 1000, currency: 'GBP' }).success,
      ).toBe(true);
    });

    it('refuses a negative price and a non-integer price', () => {
      expect(parse(SearchProductsQuery, { minPrice: -1, currency: 'GBP' }).success).toBe(false);
      expect(parse(SearchProductsQuery, { minPrice: 10.5, currency: 'GBP' }).success).toBe(false);
    });

    it('refuses an unknown query parameter rather than ignoring it', () => {
      expect(parse(SearchProductsQuery, { sort: 'price' }).success).toBe(false);
      expect(parse(SearchProductsQuery, { search: 'oak' }).success).toBe(false);
    });

    it('refuses a category or brand that is not a slug', () => {
      expect(parse(SearchProductsQuery, { category: 'Furniture' }).success).toBe(false);
      expect(parse(SearchProductsQuery, { brand: 'Northwind' }).success).toBe(false);
      expect(parse(SearchProductsQuery, { category: 'furniture' }).success).toBe(true);
      expect(parse(SearchProductsQuery, { brand: 'northwind' }).success).toBe(true);
    });
  });

  describe('SetProductDiscountRequest', () => {
    it('accepts a whole number of basis points, including zero', () => {
      expect(parse(SetProductDiscountRequest, { basisPoints: 0 }).success).toBe(true);
      expect(parse(SetProductDiscountRequest, { basisPoints: 2000 }).success).toBe(true);
      expect(parse(SetProductDiscountRequest, { basisPoints: 10000 }).success).toBe(true);
    });

    it('refuses a negative, fractional, or over-large discount', () => {
      expect(parse(SetProductDiscountRequest, { basisPoints: -1 }).success).toBe(false);
      expect(parse(SetProductDiscountRequest, { basisPoints: 12.5 }).success).toBe(false);
      expect(parse(SetProductDiscountRequest, { basisPoints: 10001 }).success).toBe(false);
    });

    it('refuses an unknown field', () => {
      expect(
        parse(SetProductDiscountRequest, { basisPoints: 2000, until: '2026-12-01' }).success,
      ).toBe(false);
    });
  });
});

describe('international search terms', () => {
  it.each(['طاولة', '椅子', 'éclairage'])('accepts a non-ASCII product term %s', (q) => {
    expect(parse(SearchProductsQuery, { q }).success).toBe(true);
  });
});
