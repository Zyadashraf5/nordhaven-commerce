/**
 * Catalogue and customer shapes from openapi/openapi.json (Nordhaven Commerce
 * Backend API 1.3.0): ProductSummaryResponse, ProductDetailResponse,
 * VariantResponse, AttributeResponse, ImageResponse, BrandRefResponse,
 * CategoryResponse, BrandResponse, CustomerProfileResponse,
 * CustomerAddressResponse and their request bodies.
 */

export interface ApiBrandRef {
  id: string;
  name: string;
  slug: string;
}

export interface ApiCategoryRef {
  id: string;
  name: string;
  slug: string;
}

export interface ApiCategoryNode extends ApiCategoryRef {
  parentId: string | null;
  position: number;
  children: ApiCategoryNode[];
  createdAt: string;
  updatedAt: string;
}

export interface ApiBrand extends ApiBrandRef {
  createdAt: string;
  updatedAt: string;
}

export interface ApiVariant {
  id: string;
  sku: string;
  color: string | null;
  size: string | null;
  material: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiAttribute {
  name: string;
  value: string;
  position: number;
}

export interface ApiImage {
  url: string;
  altText: string | null;
  position: number;
}

export interface ApiProductSummary {
  id: string;
  name: string;
  slug: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  baseCurrency: string;
  basePriceMinor: number;
  discountBasisPoints: number;
  effectivePriceMinor: number;
  brand: ApiBrandRef;
  category: ApiCategoryRef;
  createdAt: string;
  updatedAt: string;
}

export interface ApiProductDetail extends ApiProductSummary {
  description: string;
  images: ApiImage[];
  attributes: ApiAttribute[];
  variants: ApiVariant[];
}

export interface ApiProductsPage {
  items: ApiProductSummary[];
  nextCursor: string | null;
}

export interface ApiCustomerProfile {
  displayName: string | null;
  phone: string | null;
  defaultAddressId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiCustomerAddress {
  id: string;
  recipientName: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string | null;
  countryCode: string;
  phone: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiAddressInput {
  recipientName: string;
  line1: string;
  line2?: string | null;
  city: string;
  region?: string | null;
  postalCode?: string | null;
  countryCode: string;
  phone?: string | null;
}
