import { createApplication } from '../../apps/api/src/bootstrap/create-application';
import { BrandService } from '../../apps/api/src/modules/catalog/application/brand.service';
import { CategoryService } from '../../apps/api/src/modules/catalog/application/category.service';
import { ProductService } from '../../apps/api/src/modules/catalog/application/product.service';
import { DatabaseService } from '../../apps/api/src/platform/database/database.service';
import { resetCatalogDatabase } from '../helpers/catalog-database';
import { testConfigurationFor } from '../helpers/test-configuration';

type Application = Awaited<ReturnType<typeof createApplication>>['app'];

describe('Product Catalog persistence integration', () => {
  let app: Application;
  let database: DatabaseService;
  let categories: CategoryService;
  let brands: BrandService;
  let products: ProductService;

  beforeAll(async () => {
    const created = await createApplication({ configuration: testConfigurationFor('integration') });
    app = created.app;
    database = app.get(DatabaseService);
    categories = app.get(CategoryService);
    brands = app.get(BrandService);
    products = app.get(ProductService);
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetCatalogDatabase(database);
  });

  afterEach(async () => {
    await resetCatalogDatabase(database);
  });

  async function seed(): Promise<{ categoryId: string; brandId: string }> {
    const category = await categories.create({ name: 'Furniture' });
    const brand = await brands.create({ name: 'Northwind' });
    return { categoryId: category.id, brandId: brand.id };
  }

  function productInput(categoryId: string, brandId: string) {
    return {
      name: 'Oak Dining Table',
      description: 'Solid oak dining table.',
      categoryId,
      brandId,
      basePriceMinor: 129900,
      baseCurrency: 'GBP',
    };
  }

  describe('categories', () => {
    it('persists a two-level tree and derives slugs', async () => {
      const root = await categories.create({ name: 'Living Room' });
      const child = await categories.create({ name: 'Sofas', parentId: root.id });

      expect(root.slug).toBe('living-room');
      expect(child.parentId).toBe(root.id);

      const tree = await categories.listTree();
      expect(tree).toHaveLength(1);
      expect(tree[0]?.children.map((node) => node.slug)).toEqual(['sofas']);
    });

    it('refuses a third level', async () => {
      const root = await categories.create({ name: 'Living Room' });
      const child = await categories.create({ name: 'Sofas', parentId: root.id });

      await expect(
        categories.create({ name: 'Corner Sofas', parentId: child.id }),
      ).rejects.toMatchObject({ code: 'CATALOG_CONFLICT' });
      expect(await database.prisma.category.count()).toBe(2);
    });

    it('refuses a duplicate slug regardless of casing or spacing', async () => {
      await categories.create({ name: 'Living Room' });

      await expect(categories.create({ name: 'living   room' })).rejects.toMatchObject({
        code: 'CATALOG_CONFLICT',
      });
      expect(await database.prisma.category.count()).toBe(1);
    });

    it('lets exactly one of two concurrent duplicates win', async () => {
      const results = await Promise.allSettled([
        categories.create({ name: 'Living Room' }),
        categories.create({ name: 'Living Room' }),
      ]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
      expect(await database.prisma.category.count()).toBe(1);
    });

    it('refuses deleting a category that still has children or products', async () => {
      const root = await categories.create({ name: 'Living Room' });
      await categories.create({ name: 'Sofas', parentId: root.id });
      await expect(categories.remove(root.id)).rejects.toMatchObject({ code: 'CATALOG_CONFLICT' });
      expect(await database.prisma.category.count()).toBe(2);

      const { brandId } = await seed();
      await products.create(productInput(root.id, brandId));
      await expect(categories.remove(root.id)).rejects.toMatchObject({ code: 'CATALOG_CONFLICT' });
      expect(await database.prisma.category.count()).toBe(3);
    });
  });

  describe('brands', () => {
    it('refuses deleting a brand that a product references', async () => {
      const { categoryId, brandId } = await seed();
      await products.create(productInput(categoryId, brandId));

      await expect(brands.remove(brandId)).rejects.toMatchObject({ code: 'CATALOG_CONFLICT' });
      expect(await database.prisma.brand.count()).toBe(1);
    });
  });

  describe('products', () => {
    it('stores an exact price with no rounding and returns the category and brand references', async () => {
      const { categoryId, brandId } = await seed();
      const product = await products.create(productInput(categoryId, brandId));

      expect(product.status).toBe('DRAFT');
      expect(product.basePriceMinor).toBe(129900);
      expect(product.baseCurrency).toBe('GBP');
      expect(product.category.id).toBe(categoryId);
      expect(product.brand.id).toBe(brandId);

      const stored = await database.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(stored.basePriceMinor).toBe(129900);
    });

    it('replaces images and attributes atomically', async () => {
      const { categoryId, brandId } = await seed();
      const product = await products.create(productInput(categoryId, brandId));

      await products.replaceImages(product.id, [
        { url: 'https://cdn.example.com/a.jpg', altText: null, position: 0 },
        { url: 'https://cdn.example.com/b.jpg', altText: 'Side view', position: 1 },
      ]);
      const withImages = await products.replaceImages(product.id, [
        { url: 'https://cdn.example.com/c.jpg', altText: null, position: 0 },
      ]);
      expect(withImages.images.map((image) => image.url)).toEqual([
        'https://cdn.example.com/c.jpg',
      ]);

      await products.replaceAttributes(product.id, [
        { name: 'Material', value: 'Oak', position: 0 },
      ]);
      const withAttributes = await products.replaceAttributes(product.id, []);
      expect(withAttributes.attributes).toEqual([]);
      expect(await database.prisma.productImage.count()).toBe(1);
      expect(await database.prisma.productAttribute.count()).toBe(0);
    });

    it('keeps every SKU unique across the whole catalog', async () => {
      const { categoryId, brandId } = await seed();
      const first = await products.create(productInput(categoryId, brandId));
      const second = await products.create({
        ...productInput(categoryId, brandId),
        name: 'Oak Bench',
      });

      await products.createVariant(first.id, { sku: 'OAK-TABLE-01' });
      await expect(
        products.createVariant(second.id, { sku: 'OAK-TABLE-01' }),
      ).rejects.toMatchObject({
        code: 'CATALOG_CONFLICT',
      });
      expect(await database.prisma.productVariant.count()).toBe(1);
    });

    it('refuses publishing a product with no variant and publishes one that has a variant', async () => {
      const { categoryId, brandId } = await seed();
      const product = await products.create(productInput(categoryId, brandId));

      await expect(products.setStatus(product.id, 'PUBLISHED')).rejects.toMatchObject({
        code: 'CATALOG_CONFLICT',
      });

      await products.createVariant(product.id, { sku: 'OAK-TABLE-01', color: 'Oak' });
      const published = await products.setStatus(product.id, 'PUBLISHED');
      expect(published.status).toBe('PUBLISHED');
    });

    it('hides a draft product from the browsing surface and serves it once published', async () => {
      const { categoryId, brandId } = await seed();
      const product = await products.create(productInput(categoryId, brandId));

      expect(await products.listPublished({})).toMatchObject({ records: [] });
      await expect(products.getPublishedDetail('oak-dining-table')).rejects.toMatchObject({
        code: 'PRODUCT_NOT_FOUND',
      });

      await products.createVariant(product.id, { sku: 'OAK-TABLE-01' });
      await products.setStatus(product.id, 'PUBLISHED');

      expect((await products.listPublished({})).records).toHaveLength(1);
      await expect(products.getPublishedDetail('oak-dining-table')).resolves.toMatchObject({
        slug: 'oak-dining-table',
      });
    });

    it('pages deterministically with a keyset cursor', async () => {
      const { categoryId, brandId } = await seed();
      for (const name of ['Alpha Lamp', 'Beta Chair', 'Gamma Table']) {
        await products.create({ ...productInput(categoryId, brandId), name });
      }

      const first = await products.listAdmin({ limit: 2 });
      expect(first.records.map((record) => record.name)).toEqual(['Alpha Lamp', 'Beta Chair']);
      expect(first.nextCursor).not.toBeNull();

      const second = await products.listAdmin({
        limit: 2,
        ...(first.nextCursor === null ? {} : { cursor: first.nextCursor }),
      });
      expect(second.records.map((record) => record.name)).toEqual(['Gamma Table']);
      expect(second.nextCursor).toBeNull();
    });

    it('refuses a category or brand that does not exist', async () => {
      const { categoryId, brandId } = await seed();
      const missing = '99999999-9999-4999-8999-999999999999';

      await expect(products.create(productInput(missing, brandId))).rejects.toMatchObject({
        code: 'CATEGORY_NOT_FOUND',
      });
      await expect(products.create(productInput(categoryId, missing))).rejects.toMatchObject({
        code: 'BRAND_NOT_FOUND',
      });
    });

    it('cascades a product deletion to its images, attributes, and variants', async () => {
      const { categoryId, brandId } = await seed();
      const product = await products.create(productInput(categoryId, brandId));
      await products.createVariant(product.id, { sku: 'OAK-TABLE-01' });
      await products.replaceImages(product.id, [
        { url: 'https://cdn.example.com/a.jpg', altText: null, position: 0 },
      ]);

      await products.remove(product.id);

      expect(await database.prisma.product.count()).toBe(0);
      expect(await database.prisma.productVariant.count()).toBe(0);
      expect(await database.prisma.productImage.count()).toBe(0);
    });
  });

  describe('direct product discounts and the effective price', () => {
    it('stores a new product with no discount and an effective price equal to its base price', async () => {
      const { categoryId, brandId } = await seed();
      const product = await products.create(productInput(categoryId, brandId));

      expect(product.discountBasisPoints).toBe(0);
      expect(product.effectivePriceMinor).toBe(129900);

      const stored = await database.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(stored.discountBasisPoints).toBe(0);
      expect(stored.effectivePriceMinor).toBe(stored.basePriceMinor);
    });

    it('applies a percentage discount with the half-up rounding rule', async () => {
      const { categoryId, brandId } = await seed();
      const product = await products.create({
        ...productInput(categoryId, brandId),
        basePriceMinor: 1999,
      });

      // 1999 * 5000 / 10000 is exactly 999.5, which rounds half up to 1000.
      const discounted = await products.setDiscount(product.id, 5000);

      expect(discounted.discountBasisPoints).toBe(5000);
      expect(discounted.effectivePriceMinor).toBe(999);

      const stored = await database.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(stored.effectivePriceMinor).toBe(999);
    });

    it('replaces and removes a discount, and the effective price follows', async () => {
      const { categoryId, brandId } = await seed();
      const product = await products.create(productInput(categoryId, brandId));

      const first = await products.setDiscount(product.id, 2500);
      expect(first.effectivePriceMinor).toBe(97425);

      const replaced = await products.setDiscount(product.id, 1000);
      expect(replaced.discountBasisPoints).toBe(1000);
      expect(replaced.effectivePriceMinor).toBe(116910);

      const removed = await products.setDiscount(product.id, 0);
      expect(removed.discountBasisPoints).toBe(0);
      expect(removed.effectivePriceMinor).toBe(129900);
    });

    it('yields a zero, never negative, effective price at a full discount', async () => {
      const { categoryId, brandId } = await seed();
      const product = await products.create(productInput(categoryId, brandId));

      const full = await products.setDiscount(product.id, 10000);

      expect(full.effectivePriceMinor).toBe(0);
    });

    it('recomputes the effective price when the base price changes under a discount', async () => {
      const { categoryId, brandId } = await seed();
      const product = await products.create(productInput(categoryId, brandId));
      await products.setDiscount(product.id, 5000);

      const updated = await products.update(product.id, { basePriceMinor: 10000 });

      // 10000 * 5000 / 10000 is exactly 5000, so the effective price is 5000.
      expect(updated.basePriceMinor).toBe(10000);
      expect(updated.effectivePriceMinor).toBe(5000);
    });

    it('refuses a discount on a product that does not exist', async () => {
      await expect(
        products.setDiscount('99999999-9999-4999-8999-999999999999', 2000),
      ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    });

    it('refuses to store an effective price that disagrees with its base price and discount', async () => {
      const { categoryId, brandId } = await seed();
      const product = await products.create(productInput(categoryId, brandId));

      // The database, not the application, is the authority on the stored effective price.
      await expect(
        database.prisma.product.update({
          where: { id: product.id },
          data: { discountBasisPoints: 2000, effectivePriceMinor: 1 },
        }),
      ).rejects.toThrow();

      const stored = await database.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(stored.discountBasisPoints).toBe(0);
      expect(stored.effectivePriceMinor).toBe(129900);
    });

    it('refuses a discount outside the supported range', async () => {
      const { categoryId, brandId } = await seed();
      const product = await products.create(productInput(categoryId, brandId));

      await expect(
        database.prisma.product.update({
          where: { id: product.id },
          data: { discountBasisPoints: 10001, effectivePriceMinor: 129900 },
        }),
      ).rejects.toThrow();
    });
  });

  describe('search and filtering', () => {
    let unique = 0;

    async function published(
      overrides: Partial<{
        name: string;
        description: string;
        basePriceMinor: number;
        baseCurrency: string;
        categoryId: string;
        brandId: string;
      }> = {},
    ): Promise<string> {
      unique += 1;
      const category = await categories.create({ name: `Category ${unique}` });
      const brand = await brands.create({ name: `Brand ${unique}` });
      const product = await products.create({
        ...productInput(category.id, brand.id),
        ...overrides,
      });
      await products.createVariant(product.id, { sku: `SKU-${unique}-${product.id.slice(0, 8)}` });
      await products.setStatus(product.id, 'PUBLISHED');
      return product.id;
    }

    it('returns the same page as an unfiltered listing when no filter is supplied', async () => {
      await published({ name: 'Alpha Lamp' });
      await published({ name: 'Beta Chair' });

      const unfiltered = await products.listPublished({});
      const searched = await products.searchPublished({});

      expect(searched.records.map((record) => record.name)).toEqual(
        unfiltered.records.map((record) => record.name),
      );
      expect(searched.records).toHaveLength(2);
    });

    it('matches a free-text term against the name, the description, and an attribute', async () => {
      const { categoryId, brandId } = await seed();
      const table = await products.create({
        ...productInput(categoryId, brandId),
        name: 'Oak Dining Table',
        description: 'A solid oak dining table.',
      });
      await products.createVariant(table.id, { sku: 'OAK-TABLE-01' });
      await products.setStatus(table.id, 'PUBLISHED');
      await products.replaceAttributes(table.id, [
        { name: 'Material', value: 'Solid Oak', position: 0 },
      ]);

      const lamp = await products.create({
        ...productInput(categoryId, brandId),
        name: 'Reading Lamp',
        description: 'A brass lamp.',
      });
      await products.createVariant(lamp.id, { sku: 'LAMP-01' });
      await products.setStatus(lamp.id, 'PUBLISHED');

      expect(
        (await products.searchPublished({ q: 'oak' })).records.map((record) => record.name),
      ).toEqual(['Oak Dining Table']);
      expect(
        (await products.searchPublished({ q: 'BRASS' })).records.map((record) => record.name),
      ).toEqual(['Reading Lamp']);
      expect(
        (await products.searchPublished({ q: 'solid oak' })).records.map((record) => record.name),
      ).toEqual(['Oak Dining Table']);
    });

    it('never returns a product that is not published', async () => {
      const { categoryId, brandId } = await seed();
      const draft = await products.create({
        ...productInput(categoryId, brandId),
        name: 'Hidden Draft',
      });
      await published({ name: 'Visible Product' });

      expect(
        (await products.searchPublished({ q: 'draft' })).records.map((record) => record.name),
      ).toEqual([]);
      expect(
        (await products.searchPublished({ q: 'product' })).records.map((record) => record.name),
      ).toEqual(['Visible Product']);
      expect(await database.prisma.product.count()).toBe(2);
      expect(draft.status).toBe('DRAFT');
    });

    it("filters by a category and by that category's direct children", async () => {
      const root = await categories.create({ name: 'Living Room' });
      const child = await categories.create({ name: 'Sofas', parentId: root.id });
      const brand = await brands.create({ name: 'Northwind' });

      for (const [name, categoryId] of [
        ['Root Product', root.id],
        ['Child Product', child.id],
      ] as const) {
        const product = await products.create({
          ...productInput(categoryId, brand.id),
          name,
        });
        await products.createVariant(product.id, { sku: `SKU-${name.slice(0, 4)}` });
        await products.setStatus(product.id, 'PUBLISHED');
      }

      const other = await categories.create({ name: 'Kitchen' });
      const otherProduct = await products.create({
        ...productInput(other.id, brand.id),
        name: 'Other Product',
      });
      await products.createVariant(otherProduct.id, { sku: 'SKU-OTHER' });
      await products.setStatus(otherProduct.id, 'PUBLISHED');

      expect(
        (await products.searchPublished({ category: 'living-room' })).records.map(
          (record) => record.name,
        ),
      ).toEqual(['Child Product', 'Root Product']);
    });

    it('filters by a brand', async () => {
      const { categoryId, brandId } = await seed();
      const other = await brands.create({ name: 'Southwind' });
      for (const [name, id] of [
        ['Northwind Product', brandId],
        ['Southwind Product', other.id],
      ] as const) {
        const product = await products.create({ ...productInput(categoryId, id), name });
        await products.createVariant(product.id, { sku: `SKU-${name.slice(0, 4)}` });
        await products.setStatus(product.id, 'PUBLISHED');
      }

      expect(
        (await products.searchPublished({ brand: 'southwind' })).records.map(
          (record) => record.name,
        ),
      ).toEqual(['Southwind Product']);
    });

    it('filters by an attribute pair, matched case-insensitively', async () => {
      const { categoryId, brandId } = await seed();
      const product = await products.create({
        ...productInput(categoryId, brandId),
        name: 'Blue Chair',
      });
      await products.createVariant(product.id, { sku: 'CHAIR-01' });
      await products.setStatus(product.id, 'PUBLISHED');
      await products.replaceAttributes(product.id, [
        { name: 'Colour', value: 'Blue', position: 0 },
      ]);

      expect(
        (await products.searchPublished({ attribute: ['colour:blue'] })).records.map(
          (record) => record.name,
        ),
      ).toEqual(['Blue Chair']);
      expect((await products.searchPublished({ attribute: ['colour:red'] })).records).toHaveLength(
        0,
      );
    });

    it('combines several attribute filters with AND', async () => {
      const { categoryId, brandId } = await seed();
      const product = await products.create({
        ...productInput(categoryId, brandId),
        name: 'Solid Oak Chair',
      });
      await products.createVariant(product.id, { sku: 'CHAIR-02' });
      await products.setStatus(product.id, 'PUBLISHED');
      await products.replaceAttributes(product.id, [
        { name: 'Material', value: 'Oak', position: 0 },
        { name: 'Colour', value: 'Blue', position: 1 },
      ]);

      expect(
        (await products.searchPublished({ attribute: ['material:oak', 'colour:blue'] })).records,
      ).toHaveLength(1);
      expect(
        (await products.searchPublished({ attribute: ['material:oak', 'colour:red'] })).records,
      ).toHaveLength(0);
    });

    it('filters by the effective price, so a discounted product is matched on what it costs', async () => {
      const { categoryId, brandId } = await seed();
      const product = await products.create({
        ...productInput(categoryId, brandId),
        name: 'Discounted Table',
        basePriceMinor: 10000,
      });
      await products.createVariant(product.id, { sku: 'TABLE-01' });
      await products.setStatus(product.id, 'PUBLISHED');
      await products.setDiscount(product.id, 5000);

      // The base price is 10000 but the customer pays 5000.
      expect(
        (await products.searchPublished({ maxPrice: 5000, currency: 'GBP' })).records.map(
          (record) => record.name,
        ),
      ).toEqual(['Discounted Table']);
      expect(
        (await products.searchPublished({ minPrice: 5001, currency: 'GBP' })).records,
      ).toHaveLength(0);
    });

    it('excludes products in another currency from a price range', async () => {
      const { categoryId, brandId } = await seed();
      const product = await products.create({
        ...productInput(categoryId, brandId),
        name: 'Euro Product',
        basePriceMinor: 1000,
        baseCurrency: 'EUR',
      });
      await products.createVariant(product.id, { sku: 'EURO-01' });
      await products.setStatus(product.id, 'PUBLISHED');

      expect(
        (await products.searchPublished({ maxPrice: 10000, currency: 'GBP' })).records,
      ).toHaveLength(0);
      expect(
        (await products.searchPublished({ maxPrice: 10000, currency: 'EUR' })).records,
      ).toHaveLength(1);
    });

    it('returns an empty page for an unknown category or brand', async () => {
      await published({ name: 'Some Product' });

      expect(
        (await products.searchPublished({ category: 'no-such-category' })).records,
      ).toHaveLength(0);
      expect((await products.searchPublished({ brand: 'no-such-brand' })).records).toHaveLength(0);
    });

    it('pages a filtered result set without repeating or skipping a product', async () => {
      const { categoryId, brandId } = await seed();
      for (const name of ['Alpha Lamp', 'Beta Chair', 'Gamma Table', 'Delta Stool']) {
        const product = await products.create({ ...productInput(categoryId, brandId), name });
        await products.createVariant(product.id, { sku: `SKU-${name.slice(0, 4)}` });
        await products.setStatus(product.id, 'PUBLISHED');
      }
      const other = await products.create({
        ...productInput(categoryId, brandId),
        name: 'Excluded Item',
      });
      await products.createVariant(other.id, { sku: 'SKU-EXCL' });
      await products.setStatus(other.id, 'PUBLISHED');

      const seen: string[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 5; page += 1) {
        const result = await products.searchPublished({
          q: 'a',
          limit: 2,
          ...(cursor === null ? {} : { cursor }),
        });
        seen.push(...result.records.map((record) => record.name));
        cursor = result.nextCursor;
        if (cursor === null) break;
      }

      expect(seen).toHaveLength(new Set(seen).size);
      expect(seen).toContain('Alpha Lamp');
      expect(seen).toContain('Delta Stool');
      expect(cursor).toBeNull();
    });
  });
});
