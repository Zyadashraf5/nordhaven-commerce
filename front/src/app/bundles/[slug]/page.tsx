import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ShopShell } from '../../../components/layout/ShopShell';
import { BundleDetail } from '../../../components/shop/BundleDetail';
import { getCatalogBundle } from '../../../lib/catalog';

/**
 * The Bundle Detail Page — `/bundles/[slug]` (boards 10–13). One route serves
 * both kinds: a fixed set (packed stock of its own) and a dynamic set
 * (component-derived availability). The samples are the two Stage 1 sets.
 *
 * NOT LIVE API DATA: typed sample records; the Add-set action is disabled
 * because no bundles contract exists in the backend yet.
 */

interface BundlePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: BundlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const bundle = getCatalogBundle(slug);
  if (!bundle) return { title: 'Set not found · Nordhaven Commerce' };
  return {
    title: `${bundle.name} · Nordhaven Commerce`,
    description: bundle.description ?? bundle.summary,
  };
}

export default async function BundlePage({ params }: BundlePageProps) {
  const { slug } = await params;
  const bundle = getCatalogBundle(slug);
  if (!bundle) notFound();

  return (
    <ShopShell>
      <BundleDetail bundle={bundle} />
    </ShopShell>
  );
}
