import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service';
import type { CatalogPurchaseReader } from '../contracts';
const PRODUCT_FACTS = {
  id: true,
  name: true,
  slug: true,
  status: true,
  effectivePriceMinor: true,
  baseCurrency: true,
  discountBasisPoints: true,
} as const;
@Injectable()
export class CatalogPurchaseRepository implements CatalogPurchaseReader {
  public constructor(private readonly database: DatabaseService) {}
  public productFactsOf(id: string) {
    return this.database.prisma.product.findUnique({ where: { id }, select: PRODUCT_FACTS });
  }
  public variantFactsOf(id: string) {
    return this.database.prisma.productVariant.findUnique({
      where: { id },
      select: { id: true, sku: true, productId: true, product: { select: PRODUCT_FACTS } },
    });
  }
  public async variantIdBySku(sku: string): Promise<string | null> {
    return (
      (
        await this.database.prisma.productVariant.findUnique({
          where: { sku },
          select: { id: true },
        })
      )?.id ?? null
    );
  }
}
