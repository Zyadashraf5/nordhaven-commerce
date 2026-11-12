import Link from 'next/link';
import { Icon } from '../ui/Icon';
import { StorefrontImage } from '../ui/StorefrontImage';
import { formatMoney } from '../../data/money';
import { routes } from '../../lib/links';
import type { BundleSection, StorefrontBundle } from '../../data/types';
import styles from './BundleShowcase.module.css';

/**
 * Sets & bundles.
 *
 * The two bundle kinds carry different inventory models, and the cards show
 * that difference:
 *
 * - A FIXED bundle is a finished-goods SKU with its own stock: one status for
 *   the whole set, and the contents are listed as a fixed list.
 * - A DYNAMIC bundle is a fixed list of components whose availability is
 *   derived from each component SKU: every component shows its own status, and
 *   the set is available only while all of them are in stock.
 *
 * Both offer "View set" only. Adding a bundle to the cart is not offered until
 * the cart contract confirms how bundle lines are stored and priced.
 */
export function BundleShowcase({
  section,
  bundles,
}: {
  section: BundleSection;
  bundles: StorefrontBundle[];
}) {
  return (
    <section className={styles.section} aria-labelledby="hw-bundles-heading">
      <div className={styles.header}>
        <div className={styles.headerText}>
          <div className={styles.headingGroup}>
            <h2 id="hw-bundles-heading" className={styles.heading} data-split="words">
              {section.title}
            </h2>
          </div>
          <p className={styles.subtitle}>
            <span className="hw-wide">{section.subtitle}</span>
            <span className="hw-narrow">{section.subtitleShort}</span>
          </p>
        </div>
        <Link href={routes.category('sets-and-bundles')} className={styles.allLink}>
          All sets &amp; bundles
        </Link>
      </div>

      <div className={styles.grid} data-reveal-stagger>
        {bundles.map((bundle) => {
          const isFixed = bundle.kind === 'fixed';
          return (
            <article key={bundle.id} className={styles.card}>
              <div className={styles.media}>
                <StorefrontImage
                  image={bundle.image}
                  fill
                  sizes="(max-width: 1023px) 100vw, 50vw"
                  className={styles.image}
                />
              </div>
              <div className={styles.body}>
                <span
                  className={`${styles.kind} ${isFixed ? styles.kindFixed : styles.kindDynamic}`}
                >
                  <Icon name={isFixed ? 'package' : 'grid'} size={14} strokeWidth={2} />
                  {isFixed ? 'Ready-packed set' : 'Set of individual items'}
                </span>

                <div className={styles.titleRow}>
                  <h3 className={styles.cardTitle}>{bundle.name}</h3>
                  <span
                    className={`${styles.price} ${bundle.available ? '' : styles.priceUnavailable}`}
                  >
                    {formatMoney(bundle.price)}
                  </span>
                </div>

                {isFixed ? (
                  <>
                    <ul className={`${styles.componentList} ${styles.componentListFixed}`}>
                      {bundle.components.map((component) => (
                        <li
                          key={component.name}
                          className={`${styles.componentRow} ${styles.componentRowFixed}`}
                        >
                          <span>{component.name}</span>
                          <span className={styles.quantity}>× {component.quantity}</span>
                        </li>
                      ))}
                    </ul>
                    <span className={styles.summary}>{bundle.summary}</span>
                  </>
                ) : (
                  <ul className={styles.componentList}>
                    {bundle.components.map((component) => (
                      <li key={component.name} className={styles.componentRow}>
                        {component.image ? (
                          <StorefrontImage
                            image={component.image}
                            alt=""
                            className={styles.componentImage}
                            sizes="40px"
                          />
                        ) : null}
                        <span className={styles.componentName}>
                          <span className="hw-wide">{component.name}</span>
                          <span className="hw-narrow">{component.nameShort ?? component.name}</span>
                        </span>
                        <span
                          className={`${styles.componentStatus} ${
                            component.inStock ? styles.statusOk : styles.statusError
                          }`}
                        >
                          {component.inStock ? '✓ In stock' : '✕ Out of stock'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className={styles.footer}>
                  <span className={styles.statusGroup}>
                    <span
                      className={`${styles.status} ${
                        bundle.available ? styles.statusOk : styles.statusError
                      }`}
                    >
                      {isFixed ? (
                        <>
                          <Icon name="check" size={15} strokeWidth={1.8} />
                          <span className="hw-wide">In stock as a packed set</span>
                          <span className="hw-narrow">✓ In stock as a packed set</span>
                        </>
                      ) : bundle.available ? (
                        <>
                          <span className="hw-wide">All 3 items in stock</span>
                          <span className="hw-narrow">All 3 items in stock</span>
                        </>
                      ) : (
                        <>
                          <span className="hw-wide">Unavailable</span>
                          <span className="hw-narrow">✕ Unavailable</span>
                        </>
                      )}
                      <span className={styles.statusNote}>{bundle.statusNote}</span>
                    </span>
                    <span className={styles.inventoryNote}>{bundle.inventoryNote}</span>
                  </span>
                  <Link href={routes.bundle(bundle.slug)} className={styles.viewSet}>
                    View set
                    <Icon name="arrow-right" size={17} strokeWidth={2} />
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
