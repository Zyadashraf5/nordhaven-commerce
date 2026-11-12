'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ProductCard } from './ProductCard';
import { VariantSheet } from './VariantSheet';
import { routes } from '../../lib/links';
import type { ProductListing, StorefrontProduct } from '../../data/types';
import styles from './ProductShowcase.module.css';

const TABS: { id: ProductListing; label: string }[] = [
  { id: 'featured', label: 'Featured' },
  { id: 'new_in', label: 'New in' },
  { id: 'on_offer', label: 'On offer' },
];

export function ProductShowcase({ products }: { products: StorefrontProduct[] }) {
  const [activeTab, setActiveTab] = useState<ProductListing>('featured');
  const [variantProduct, setVariantProduct] = useState<StorefrontProduct | null>(null);
  const [variantColourId, setVariantColourId] = useState<string | undefined>(undefined);

  const visibleProducts = useMemo(
    () => products.filter((product) => product.listings.includes(activeTab)),
    [products, activeTab],
  );

  return (
    <section className={styles.section} aria-labelledby="hw-products-heading">
      <div className={styles.header}>
        <div className={styles.headingGroup}>
          <h2 id="hw-products-heading" className={styles.heading} data-split="words">
            Chosen for everyday use
          </h2>
        </div>
        <div role="tablist" aria-label="Product lists" className={styles.tabs}>
          {TABS.map((tab) => {
            const selected = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`${styles.tab} ${selected ? styles.tabActive : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'on_offer' ? (
        <p className={styles.offerNote}>
          Only products whose effective price is below their previous price appear here.
        </p>
      ) : null}

      <div className={styles.grid} data-reveal-stagger key={activeTab}>
        {visibleProducts.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onChooseOptions={(selected, colourId) => {
              setVariantProduct(selected);
              setVariantColourId(colourId);
            }}
          />
        ))}
      </div>

      <Link href={routes.products} className={styles.shopAll}>
        Shop all products
      </Link>

      <VariantSheet
        product={variantProduct}
        initialColourId={variantColourId}
        onClose={() => setVariantProduct(null)}
      />
    </section>
  );
}
