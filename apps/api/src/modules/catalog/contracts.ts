/** Published read facts for deliberate SKU/product foreign references. No foreign persistence API is exposed. */
export interface CatalogProductFacts {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  readonly effectivePriceMinor: number;
  readonly baseCurrency: string;
  readonly discountBasisPoints: number;
}
export interface CatalogVariantFacts {
  readonly id: string;
  readonly sku: string;
  readonly productId: string;
  readonly product: CatalogProductFacts;
}
export interface CatalogPurchaseReader {
  productFactsOf(id: string): Promise<CatalogProductFacts | null>;
  variantFactsOf(id: string): Promise<CatalogVariantFacts | null>;
  variantIdBySku(sku: string): Promise<string | null>;
}
export const CATALOG_PURCHASE_READER = Symbol('CATALOG_PURCHASE_READER');
