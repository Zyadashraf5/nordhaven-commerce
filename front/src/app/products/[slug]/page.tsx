import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ShopShell } from '../../../components/layout/ShopShell';
import { ProductDetailShell } from '../../../components/pdp/ProductDetailShell';
import { ProductDetailSections } from '../../../components/pdp/ProductDetailSections';
import { getLiveProduct } from '../../../lib/live-catalog';
import { resolveSelectionFromParams, type VariantParams } from '../../../lib/variant';

/**
 * The Product Detail Page — `/products/[slug]` (boards 07/08; the Arabic
 * preview of this same page is board 09). The server component reads the
 * product from `GET /api/v1/catalog/products/{slug}`: name, description,
 * brand, category, images, attributes, variants (SKU, colour, size,
 * material) and the effective / previous price. `ProductDetailShell` owns
 * the variant state and the URL (?sku=…).
 *
 * Not in the API, so not shown: stock (the page says availability is
 * confirmed at checkout), care, box contents, dimensions, related products.
 * An unknown slug is a 404; an unreachable API raises the error boundary.
 */

interface ProductPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  let product = null;
  try {
    product = await getLiveProduct(slug);
  } catch {
    return { title: 'Product · Nordhaven Commerce' };
  }
  if (!product) return { title: 'Product not found · Nordhaven Commerce' };
  return {
    title: `${product.name} · Nordhaven Commerce`,
    description: product.description ?? product.summary,
  };
}

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const { slug } = await params;
  const product = await getLiveProduct(slug);
  if (!product) notFound();

  // The URL (?sku=…) is the single source of truth for the picked variant;
  // the server resolves it so both the SSR paint and the client island agree.
  const request = await searchParams;
  const variantParams: VariantParams = {
    sku: asString(request.sku),
    colour: asString(request.colour),
    size: asString(request.size),
  };
  const initialSelection = resolveSelectionFromParams(product, variantParams);

  return (
    <ShopShell>
      <ProductDetailShell
        product={product}
        inSetCard={undefined}
        initialSelection={initialSelection}
      >
        <ProductDetailSections product={product} goesWellWith={[]} />
      </ProductDetailShell>
    </ShopShell>
  );
}

function asString(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}
