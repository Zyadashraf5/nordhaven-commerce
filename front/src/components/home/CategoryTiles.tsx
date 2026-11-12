import Link from 'next/link';
import { StorefrontImage } from '../ui/StorefrontImage';
import { routes } from '../../lib/links';
import type { StorefrontCategory } from '../../data/types';
import styles from './CategoryTiles.module.css';

export function CategoryTiles({ categories }: { categories: StorefrontCategory[] }) {
  return (
    <section className={styles.section} aria-labelledby="hw-categories-heading">
      <div className={styles.headingRow}>
        <div className={styles.headingGroup}>
          <h2 id="hw-categories-heading" className={styles.heading} data-split="words">
            Shop by category
          </h2>
        </div>
        <Link href={routes.products} className={styles.allLink}>
          <span className="hw-wide">All categories</span>
          <span className="hw-narrow">All</span>
        </Link>
      </div>

      <div className={styles.grid} data-reveal-stagger>
        {categories.map((category) => (
          <Link key={category.id} href={routes.category(category.slug)} className={styles.tile}>
            <span
              className={`${styles.tileImageWrap} ${
                category.tone === 'cool' ? styles.tileImageCool : ''
              }`}
            >
              <StorefrontImage
                image={category.image}
                alt=""
                fill
                sizes="(max-width: 1023px) 112px, 200px"
                className={styles.tileImage}
              />
            </span>
            <span className={styles.tileLabel}>{category.name}</span>
          </Link>
        ))}
        <Link href={routes.products} className={`${styles.tile} ${styles.allTileLink}`}>
          <span className={styles.allTile}>All →</span>
          <span className={styles.tileLabel}>All categories</span>
        </Link>
      </div>
    </section>
  );
}
