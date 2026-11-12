import { randomUUID } from 'node:crypto';
import { createApplication } from '../../apps/api/src/bootstrap/create-application';
import { DatabaseService } from '../../apps/api/src/platform/database/database.service';
import { ProductService } from '../../apps/api/src/modules/catalog/application/product.service';
import { CategoryService } from '../../apps/api/src/modules/catalog/application/category.service';
import { ProductRepository } from '../../apps/api/src/modules/catalog/persistence/product.repository';
import { CategoryRepository } from '../../apps/api/src/modules/catalog/persistence/category.repository';
import { resetCatalogDatabase } from '../helpers/catalog-database';
import { testConfigurationFor } from '../helpers/test-configuration';

type Application = Awaited<ReturnType<typeof createApplication>>['app'];
describe('catalog audit regression invariants', () => {
  let app: Application;
  let db: DatabaseService;
  let products: ProductService;
  let categories: CategoryService;
  let pr: ProductRepository;
  let cr: CategoryRepository;
  beforeAll(async () => {
    ({ app } = await createApplication({ configuration: testConfigurationFor('integration') }));
    db = app.get(DatabaseService);
    products = app.get(ProductService);
    categories = app.get(CategoryService);
    pr = app.get(ProductRepository);
    cr = app.get(CategoryRepository);
  }, 30_000);
  beforeEach(async () => {
    await resetCatalogDatabase(db);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await resetCatalogDatabase(db);
  });
  afterAll(async () => {
    await app.close();
  });

  async function product(count: number, published = false) {
    const category = await categories.create({ name: randomUUID() });
    const brand = await db.prisma.brand.create({ data: { name: 'Brand', slug: randomUUID() } });
    const parent = await products.create({
      name: randomUUID(),
      description: 'Audit fixture',
      categoryId: category.id,
      brandId: brand.id,
      basePriceMinor: 100,
      baseCurrency: 'GBP',
    });
    const variants = [];
    for (let i = 0; i < count; i++)
      variants.push(await products.createVariant(parent.id, { sku: randomUUID() }));
    if (published) await products.setStatus(parent.id, 'PUBLISHED');
    return { parent, variants };
  }

  it('refuses deleting the last published SKU but permits removal after returning to draft', async () => {
    const { parent, variants } = await product(1, true);
    const id = variants[0]!.id;
    await expect(products.removeVariant(id)).rejects.toMatchObject({ code: 'CATALOG_CONFLICT' });
    expect((await products.getPublishedDetail(parent.slug)).variants).toHaveLength(1);
    await products.setStatus(parent.id, 'DRAFT');
    await products.removeVariant(id);
    expect((await products.getDetail(parent.id)).variants).toHaveLength(0);
  });

  it('serializes concurrent SKU removals so a published product retains one', async () => {
    const { parent, variants } = await product(2, true);
    const outcomes = await Promise.allSettled(variants.map((v) => products.removeVariant(v.id)));
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = outcomes.find((r) => r.status === 'rejected');
    expect(failed?.status === 'rejected' ? failed.reason : null).toMatchObject({
      code: 'CATALOG_CONFLICT',
    });
    expect((await products.getPublishedDetail(parent.slug)).variants).toHaveLength(1);
  });

  it('revalidates publication after a last-SKU removal overtakes the service precheck', async () => {
    const { parent, variants } = await product(1);
    // Reproduce the precise scheduling gap between the service precheck and its repository write.
    const update = pr.update.bind(pr);
    jest.spyOn(pr, 'update').mockImplementationOnce(async (id, attributes) => {
      await products.removeVariant(variants[0]!.id);
      return update(id, attributes);
    });
    await expect(products.setStatus(parent.id, 'PUBLISHED')).rejects.toMatchObject({
      code: 'CATALOG_CONFLICT',
    });
    expect((await products.getDetail(parent.id)).status).toBe('DRAFT');
  });

  it('checks the locked published state if publication overtakes deletion', async () => {
    const { parent, variants } = await product(1);
    const remove = pr.deleteVariant.bind(pr);
    jest.spyOn(pr, 'deleteVariant').mockImplementationOnce(async (id) => {
      await products.setStatus(parent.id, 'PUBLISHED');
      return remove(id);
    });
    await expect(products.removeVariant(variants[0]!.id)).rejects.toMatchObject({
      code: 'CATALOG_CONFLICT',
    });
    expect((await products.getPublishedDetail(parent.slug)).variants).toHaveLength(1);
  });

  it('serializes opposing root reparenting and never loses nodes from the public tree', async () => {
    const a = await categories.create({ name: 'A' });
    const b = await categories.create({ name: 'B' });
    const outcomes = await Promise.allSettled([
      cr.update(a.id, { parentId: b.id }),
      cr.update(b.id, { parentId: a.id }),
    ]);
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = outcomes.find((r) => r.status === 'rejected');
    expect(failed?.status === 'rejected' ? failed.reason : null).toMatchObject({
      code: 'CATALOG_CONFLICT',
    });
    const tree = await categories.listTree();
    expect(tree).toHaveLength(1);
    expect(tree[0]?.children).toHaveLength(1);
    expect(await db.prisma.category.count()).toBe(2);
  });

  it('revalidates hierarchy when a child insertion overtakes reparenting', async () => {
    const a = await categories.create({ name: 'A' });
    const b = await categories.create({ name: 'B' });
    const update = cr.update.bind(cr);
    jest.spyOn(cr, 'update').mockImplementationOnce(async (id, attributes) => {
      await categories.create({ name: 'Child', parentId: a.id });
      return update(id, attributes);
    });
    await expect(categories.update(a.id, { parentId: b.id })).rejects.toMatchObject({
      code: 'CATALOG_CONFLICT',
    });
    expect((await cr.findById(a.id))?.parentId).toBeNull();
    expect(await db.prisma.category.count()).toBe(3);
  });

  it('revalidates a root parent when reparenting overtakes child creation', async () => {
    const a = await categories.create({ name: 'A' });
    const b = await categories.create({ name: 'B' });
    const create = cr.create.bind(cr);
    jest.spyOn(cr, 'create').mockImplementationOnce(async (attributes) => {
      await categories.update(a.id, { parentId: b.id });
      return create(attributes);
    });
    await expect(categories.create({ name: 'Child', parentId: a.id })).rejects.toMatchObject({
      code: 'CATALOG_CONFLICT',
    });
    expect(await db.prisma.category.count()).toBe(2);
  });
});
