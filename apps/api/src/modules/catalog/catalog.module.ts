import { CATALOG_PURCHASE_READER } from './contracts';
import { CatalogPurchaseRepository } from './persistence/catalog-purchase.repository';
import { Module } from '@nestjs/common';
import { AdminBrandsController } from './api/admin-brands.controller';
import { AdminCategoriesController } from './api/admin-categories.controller';
import { AdminProductsController } from './api/admin-products.controller';
import { AdminVariantsController } from './api/admin-variants.controller';
import { CatalogController } from './api/catalog.controller';
import { BrandService } from './application/brand.service';
import { CategoryService } from './application/category.service';
import { ProductService } from './application/product.service';
import { BrandRepository } from './persistence/brand.repository';
import { CategoryRepository } from './persistence/category.repository';
import { ProductRepository } from './persistence/product.repository';

/**
 * Product Catalog module.
 *
 * Owns the manually administered catalog (categories, brands, products, images, attributes, and
 * sellable variants) and its anonymous browsing surface, and nothing else. It integrates with Identity
 * and Access only through the platform authorization contract (`@Roles`, `@Public`, and the global
 * guard chain): it never imports another feature module and never reads or writes another module's
 * tables. Pricing/discount facts are Catalog-owned; inventory and bundle behavior remains Inventory-owned.
 */
@Module({
  controllers: [
    CatalogController,
    AdminCategoriesController,
    AdminBrandsController,
    AdminProductsController,
    AdminVariantsController,
  ],
  exports: [CATALOG_PURCHASE_READER],
  providers: [
    CatalogPurchaseRepository,
    { provide: CATALOG_PURCHASE_READER, useExisting: CatalogPurchaseRepository },
    CategoryRepository,
    BrandRepository,
    ProductRepository,
    CategoryService,
    BrandService,
    ProductService,
  ],
})
export class CatalogModule {}
