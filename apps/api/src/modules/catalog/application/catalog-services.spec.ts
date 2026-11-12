import { AppError } from '../../../platform/http/app-error';
import type { BrandRecord, BrandRepository } from '../persistence/brand.repository';
import type { CategoryRecord, CategoryRepository } from '../persistence/category.repository';
import type {
  ProductDetailRecord,
  ProductRepository,
  ProductStatusValue,
  VariantCreateAttributes,
  VariantUpdateAttributes,
} from '../persistence/product.repository';
import { BrandService } from './brand.service';
import { CategoryService } from './category.service';
import { ProductService } from './product.service';

const NOW = new Date('2026-10-20T10:00:00.000Z');
const CATEGORY_ID = '11111111-1111-4111-8111-111111111111';
const CHILD_ID = '22222222-2222-4222-8222-222222222222';
const BRAND_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const VARIANT_ID = '55555555-5555-4555-8555-555555555555';

function categoryRecord(id: string, parentId: string | null): CategoryRecord {
  return {
    id,
    name: 'Furniture',
    slug: `furniture-${id.slice(0, 4)}`,
    parentId,
    position: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function brandRecord(id: string): BrandRecord {
  return {
    id,
    name: 'Northwind',
    slug: `northwind-${id.slice(0, 4)}`,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function productRecord(status: ProductStatusValue = 'DRAFT'): ProductDetailRecord {
  return {
    id: PRODUCT_ID,
    name: 'Oak Dining Table',
    slug: 'oak-dining-table',
    status,
    basePriceMinor: 129900,
    baseCurrency: 'GBP',
    discountBasisPoints: 0,
    effectivePriceMinor: 129900,
    description: 'Solid oak dining table.',
    category: { id: CATEGORY_ID, name: 'Furniture', slug: 'furniture' },
    brand: { id: BRAND_ID, name: 'Northwind', slug: 'northwind' },
    images: [],
    attributes: [],
    variants: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

/** Minimal repository fakes; the database invariants are covered by the integration suite. */
class FakeCategoryRepository {
  public readonly rows: CategoryRecord[];

  public constructor(rows: CategoryRecord[]) {
    this.rows = rows;
  }

  public listAll(): Promise<CategoryRecord[]> {
    return Promise.resolve([...this.rows]);
  }

  public findById(id: string): Promise<CategoryRecord | null> {
    return Promise.resolve(this.rows.find((row) => row.id === id) ?? null);
  }

  public hasChildren(id: string): Promise<boolean> {
    return Promise.resolve(this.rows.some((row) => row.parentId === id));
  }

  public create(): Promise<CategoryRecord> {
    return Promise.resolve(categoryRecord(CHILD_ID, null));
  }

  public update(): Promise<CategoryRecord> {
    return Promise.resolve(categoryRecord(CATEGORY_ID, null));
  }

  public delete(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeBrandRepository {
  public readonly rows: BrandRecord[];

  public constructor(rows: BrandRecord[]) {
    this.rows = rows;
  }

  public listAll(): Promise<BrandRecord[]> {
    return Promise.resolve([...this.rows]);
  }

  public findById(id: string): Promise<BrandRecord | null> {
    return Promise.resolve(this.rows.find((row) => row.id === id) ?? null);
  }

  public create(): Promise<BrandRecord> {
    return Promise.resolve(brandRecord(BRAND_ID));
  }

  public update(): Promise<BrandRecord> {
    return Promise.resolve(brandRecord(BRAND_ID));
  }

  public delete(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeProductRepository {
  public product: ProductDetailRecord = productRecord();

  public findDetailById(): Promise<ProductDetailRecord | null> {
    return Promise.resolve(this.product);
  }

  public findPublishedDetailBySlug(): Promise<ProductDetailRecord | null> {
    return Promise.resolve(this.product.status === 'PUBLISHED' ? this.product : null);
  }

  public listAdmin(): Promise<{ records: readonly ProductDetailRecord[]; hasMore: boolean }> {
    return Promise.resolve({ records: [this.product], hasMore: false });
  }

  public listPublished(): Promise<{ records: readonly ProductDetailRecord[]; hasMore: boolean }> {
    return Promise.resolve({ records: [this.product], hasMore: false });
  }

  public countVariants(): Promise<number> {
    return Promise.resolve(this.product.variants.length);
  }

  public update(
    _id: string,
    attributes: { status?: ProductStatusValue },
  ): Promise<ProductDetailRecord> {
    this.product = {
      ...this.product,
      ...(attributes.status === undefined ? {} : { status: attributes.status }),
    };
    return Promise.resolve(this.product);
  }

  public createVariant(_productId: string, attributes: VariantCreateAttributes): Promise<unknown> {
    return Promise.resolve({ id: VARIANT_ID, ...attributes, createdAt: NOW, updatedAt: NOW });
  }

  public updateVariant(_id: string, attributes: VariantUpdateAttributes): Promise<unknown> {
    return Promise.resolve({
      id: VARIANT_ID,
      sku: attributes.sku ?? 'OAK-TABLE-01',
      color: null,
      size: null,
      material: null,
      position: 0,
      ...attributes,
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
}

function asProductRepository(fake: FakeProductRepository): ProductRepository {
  return fake as unknown as ProductRepository;
}

describe('catalog services', () => {
  describe('CategoryService', () => {
    it('refuses a parent that is not a root, keeping the hierarchy at two levels', async () => {
      const repository = new FakeCategoryRepository([
        categoryRecord(CATEGORY_ID, null),
        categoryRecord(CHILD_ID, CATEGORY_ID),
      ]);
      const service = new CategoryService(repository as unknown as CategoryRepository);

      await expect(service.create({ name: 'Sofas', parentId: CHILD_ID })).rejects.toMatchObject({
        code: 'CATALOG_CONFLICT',
      });
    });

    it('refuses moving a category that has children beneath another category', async () => {
      const repository = new FakeCategoryRepository([
        categoryRecord(CATEGORY_ID, null),
        categoryRecord(CHILD_ID, CATEGORY_ID),
      ]);
      const service = new CategoryService(repository as unknown as CategoryRepository);

      await expect(service.update(CATEGORY_ID, { parentId: CHILD_ID })).rejects.toMatchObject({
        code: 'CATALOG_CONFLICT',
      });
    });

    it('refuses a parent that does not exist', async () => {
      const repository = new FakeCategoryRepository([]);
      const service = new CategoryService(repository as unknown as CategoryRepository);

      await expect(service.create({ name: 'Sofas', parentId: CATEGORY_ID })).rejects.toMatchObject({
        code: 'CATEGORY_NOT_FOUND',
      });
    });

    it('refuses an update to an unknown category', async () => {
      const repository = new FakeCategoryRepository([]);
      const service = new CategoryService(repository as unknown as CategoryRepository);

      await expect(service.update(CATEGORY_ID, { name: 'Sofas' })).rejects.toMatchObject({
        code: 'CATEGORY_NOT_FOUND',
      });
    });

    it('exposes an AppError so the safe envelope carries a status', () => {
      expect(AppError.categoryNotFound()).toMatchObject({ code: 'CATEGORY_NOT_FOUND' });
    });
  });

  describe('BrandService', () => {
    it('refuses an update to an unknown brand', async () => {
      const service = new BrandService(new FakeBrandRepository([]) as unknown as BrandRepository);

      await expect(service.update(BRAND_ID, { name: 'Acme' })).rejects.toMatchObject({
        code: 'BRAND_NOT_FOUND',
      });
    });
  });

  describe('ProductService', () => {
    function build(product: ProductDetailRecord = productRecord()): ProductService {
      const products = new FakeProductRepository();
      products.product = product;
      return new ProductService(
        asProductRepository(products),
        new FakeCategoryRepository([
          categoryRecord(CATEGORY_ID, null),
        ]) as unknown as CategoryRepository,
        new FakeBrandRepository([brandRecord(BRAND_ID)]) as unknown as BrandRepository,
      );
    }

    it('refuses publishing a product that has no sellable variant', async () => {
      const service = build();

      await expect(service.setStatus(PRODUCT_ID, 'PUBLISHED')).rejects.toMatchObject({
        code: 'CATALOG_CONFLICT',
      });
    });

    it('publishes a product that has a variant', async () => {
      const product = productRecord();
      const withVariant: ProductDetailRecord = {
        ...product,
        variants: [
          {
            id: VARIANT_ID,
            sku: 'OAK-TABLE-01',
            color: null,
            size: null,
            material: null,
            position: 0,
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
      };
      const service = build(withVariant);

      await expect(service.setStatus(PRODUCT_ID, 'PUBLISHED')).resolves.toMatchObject({
        status: 'PUBLISHED',
      });
    });

    it('answers a product that is not published like a product that does not exist', async () => {
      const service = build(productRecord('DRAFT'));

      await expect(service.getPublishedDetail('oak-dining-table')).rejects.toMatchObject({
        code: 'PRODUCT_NOT_FOUND',
      });
    });

    it('serves a published product', async () => {
      const service = build(productRecord('PUBLISHED'));

      await expect(service.getPublishedDetail('oak-dining-table')).resolves.toMatchObject({
        slug: 'oak-dining-table',
      });
    });

    it('rejects an unreadable cursor at the boundary rather than silently restarting the page', async () => {
      const service = build();

      await expect(service.listPublished({ cursor: 'not-a-cursor' })).rejects.toMatchObject({
        status: 400,
      });
    });

    it('enriches the listing with a next cursor only when more rows exist', async () => {
      const service = build();

      await expect(service.listPublished({})).resolves.toMatchObject({ nextCursor: null });
    });
  });
});
