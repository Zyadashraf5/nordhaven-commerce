import { ShopShell } from '../../../components/layout/ShopShell';
import styles from '../../../components/shop/ProductListing.module.css';

/**
 * The loading state (board-06 §3): skeletons in the final layout, not a
 * spinner. Next.js shows this while the segment loads — the approved boards
 * describe it as "skeletons in the final layout; filters stay usable".
 */
export function ListingSkeleton() {
  return (
    <div className={styles.page} aria-busy="true" aria-label="Loading products">
      <div className={styles.skeletonLayout}>
        <span
          className={styles.skeletonLine}
          style={{ width: '30%', marginInline: 0, height: 18 }}
        />
        <span className={styles.skeletonLine} style={{ width: '52%', marginTop: 14, height: 44 }} />
      </div>

      <div className={styles.skeletonPage}>
        <div className={`${styles.skeletonSidebar} ${styles.desktopOnly}`}>
          <div className={styles.skeletonLayout}>
            <span className={styles.skeletonLine} style={{ width: '60%' }} />
            <span className={styles.skeletonLine} style={{ width: '90%' }} />
            <span className={styles.skeletonLine} style={{ width: '80%' }} />
            <span className={styles.skeletonLine} style={{ width: '85%' }} />
            <span className={styles.skeletonLine} style={{ width: '75%' }} />
            <span className={styles.skeletonLine} style={{ width: '70%' }} />
          </div>
        </div>
        <div className={styles.skeletonGrid}>
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className={styles.skeletonCard}>
              <span className={styles.skeletonMedia} />
              <div className={styles.skeletonLayout}>
                <span className={styles.skeletonLine} style={{ width: '85%' }} />
                <span className={styles.skeletonLine} style={{ width: '40%' }} />
                <span
                  className={styles.skeletonLine}
                  style={{ height: 40, width: '72%', borderRadius: 999, marginBottom: 16 }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ProductsLoading() {
  return (
    <ShopShell mobileHeader="search">
      <ListingSkeleton />
    </ShopShell>
  );
}
