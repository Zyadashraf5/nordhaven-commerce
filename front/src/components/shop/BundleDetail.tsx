import Link from 'next/link';
import { Icon } from '../ui/Icon';
import { StorefrontImage } from '../ui/StorefrontImage';
import { formatMoney } from '../../data/money';
import { getCatalogProduct } from '../../lib/catalog';
import type { StorefrontBundle } from '../../data/types';
import { BundleBuyControls } from './BundleBuyControls';
import styles from './BundleDetail.module.css';

/**
 * The bundle detail page body (boards 10–13). A fixed set is a finished-goods
 * SKU with its own stock, shown with its packing panel and "What's in the
 * box"; a dynamic set is a predefined list of components whose availability
 * is derived per component and shown without a packed-goods claim.
 *
 * NOT LIVE API DATA: sample records from `lib/catalog.ts`; the Add-set
 * action stays disabled because no bundles contract exists yet.
 */
const DEMO_TAILNOTE =
  'Set checkout isn’t connected in this milestone — adding a set to the cart needs the bundles contract (stage F06).';

export function BundleDetail({ bundle }: { bundle: StorefrontBundle }) {
  const isFixed = bundle.kind === 'fixed';
  const available = isFixed
    ? bundle.inStock === true
    : bundle.components.every((component) => component.inStock);
  const unavailable = bundle.components.filter((component) => !component.inStock);

  return (
    <div className={styles.page}>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <Link href="/" className={styles.crumbsLink}>
          Home
        </Link>
        <span aria-hidden="true">/</span>
        <Link href="/products?category=sets-and-bundles" className={styles.crumbsLink}>
          Sets &amp; bundles
        </Link>
        <span aria-hidden="true">/</span>
        <span className={styles.crumbsCurrent}>{bundle.name}</span>
      </nav>

      <div className={styles.topColumns}>
        {/* image column: stage + the first shots as thumbs */}
        <section className={styles.gallery} aria-label="Set image">
          <figure className={styles.stage}>
            <StorefrontImage
              image={bundle.image}
              alt={bundle.image.alt}
              fill
              sizes="(max-width: 1023px) 100vw, 720px"
              priority
            />
          </figure>
          {bundle.components.some((component) => component.image) ? (
            <div className={styles.thumbRow} role="img" aria-label="Contents of the set">
              {bundle.components
                .filter((component) => component.image)
                .map((component) => (
                  <span key={component.name} className={styles.thumb}>
                    <StorefrontImage image={component.image!} alt="" sizes="120px" />
                  </span>
                ))}
            </div>
          ) : null}
        </section>

        {/* buy column */}
        <section className={styles.details} aria-label="Set details and availability">
          <span className={`${styles.badge} ${isFixed ? styles.badgeFixed : styles.badgeDynamic}`}>
            <Icon
              name={isFixed ? 'package' : 'grid'}
              size={13}
              strokeWidth={2}
              aria-hidden="true"
            />
            {isFixed ? 'Ready-packed set' : 'Set of individual items'}
          </span>

          <div className={styles.detailsHead}>
            <h1 id="bundle-name" className={styles.headline} data-intro data-split="words">
              {bundle.name}
            </h1>
            {bundle.description ? <p className={styles.description}>{bundle.description}</p> : null}
          </div>

          <div className={styles.priceBlock}>
            <bdi>
              <span className={styles.price}>{formatMoney(bundle.price)}</span>
            </bdi>
            <span className={styles.priceNote}>
              Price for the {isFixed ? 'complete packed set' : 'complete set'}. Checked again at
              checkout.
            </span>
          </div>

          <div className={styles.statusBlock}>
            <span
              role="status"
              className={`${styles.statusText} ${available ? '' : styles.statusTextMuted}`}
            >
              {available ? (
                <Icon name="check" size={15} strokeWidth={1.9} aria-hidden="true" />
              ) : (
                <Icon name="cross" size={15} strokeWidth={1.9} aria-hidden="true" />
              )}
              {available
                ? isFixed
                  ? 'In stock as a packed set'
                  : `All ${bundle.components.length} items in stock`
                : unavailable.length > 0
                  ? `Currently unavailable — ${unavailable
                      .map((component) => component.nameShort ?? component.name)
                      .join(', ')} ${unavailable.length > 1 ? 'are' : 'is'} out of stock`
                  : 'Out of stock'}
            </span>
            {isFixed && bundle.sku ? (
              <span className={styles.skuLine}>Ships as one box · SKU {bundle.sku}</span>
            ) : null}
          </div>

          {!isFixed ? (
            <div className={styles.inThisSet}>
              <span className={styles.inThisSetTitle}>In this set</span>
              <div className={styles.inThisSetRows}>
                {bundle.components.map((component) => (
                  <span key={component.name} className={styles.inThisSetRow}>
                    {component.image ? (
                      <StorefrontImage
                        image={component.image}
                        alt=""
                        className={styles.inThisSetImage}
                        sizes="48px"
                      />
                    ) : null}
                    <span className={styles.inThisSetBody}>
                      <span className={styles.inThisSetName}>{component.name}</span>
                      <span className={styles.inThisSetLine}>
                        {component.line ?? component.nameShort ?? ''}
                      </span>
                    </span>
                    <span
                      className={`${styles.inThisSetStatus} ${
                        component.inStock ? '' : styles.inThisSetStatusOut
                      }`}
                    >
                      {component.inStock ? '✓ In stock' : 'Out of stock'}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <BundleBuyControls nameId="bundle-name" noteId="bundle-note" tailnote={DEMO_TAILNOTE}>
            <section className={styles.howPanel} aria-label="How this set works">
              <strong className={styles.howTitle}>
                {isFixed ? 'How a ready-packed set works' : 'How this set works'}
              </strong>
              <ul className={styles.howList}>
                {isFixed ? (
                  <>
                    <li>Packed in advance and shipped as one box.</li>
                    <li>The items and colours inside are fixed and can’t be swapped.</li>
                    <li>Stock shown is for packed sets — not for the items sold separately.</li>
                  </>
                ) : (
                  <>
                    <li>Made up of individual items from our regular stock.</li>
                    <li>The items and colours are fixed — this isn’t a build-your-own set.</li>
                    <li>Available only while every item in it is in stock.</li>
                  </>
                )}
              </ul>
            </section>
          </BundleBuyControls>
        </section>
      </div>

      {/* contents + details */}
      <section aria-label="Contents and set details" className={styles.section}>
        <div>
          {isFixed ? (
            <>
              <h2 className={styles.sectionTitle}>What’s in the box</h2>
              <div>
                {bundle.components.map((component) => (
                  <div key={component.name} className={styles.componentRows}>
                    {component.image ? (
                      <StorefrontImage
                        image={component.image}
                        alt=""
                        className={styles.componentImage}
                        sizes="96px"
                      />
                    ) : null}
                    <div className={styles.componentBody}>
                      <span className={styles.componentName}>{component.name}</span>
                      {component.line ? (
                        <span className={styles.componentLine}>{component.line}</span>
                      ) : null}
                      {component.productSlug ? (
                        <Link
                          href={`/products/${component.productSlug}`}
                          className={styles.separately}
                        >
                          Also sold separately
                          <Icon name="chevron-right" size={14} strokeWidth={2} aria-hidden="true" />
                        </Link>
                      ) : null}
                    </div>
                    {component.quantity > 1 ? (
                      <span className={styles.componentQty}>×{component.quantity}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <h2 className={styles.sectionTitle}>Items in this set</h2>
              <div className={styles.itemsGrid}>
                {bundle.components.map((component) => (
                  <Link
                    key={component.name}
                    href={component.productSlug ? `/products/${component.productSlug}` : '#'}
                    className={styles.itemCard}
                  >
                    {component.image ? (
                      <StorefrontImage
                        image={component.image}
                        alt=""
                        className={styles.itemCardImage}
                        sizes="72px"
                      />
                    ) : null}
                    <span className={styles.itemCardBody}>
                      <span className={styles.itemCardName}>{standaloneName(component)}</span>
                      <span className={styles.itemCardLine}>{ownLine(component)}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>

        <div className={styles.detailsCol}>
          <h2 className={styles.sectionTitle}>Set details</h2>
          {isFixed && bundle.setDetails ? (
            <dl className={styles.detailsList}>
              {bundle.setDetails.map((detail) => (
                <div key={detail.label} className={styles.detailsRow}>
                  <dt className={styles.detailsTerm}>{detail.label}</dt>
                  <dd className={styles.detailsDefinition}>{detail.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <dl className={styles.detailsList}>
              <div className={styles.detailsRow}>
                <dt className={styles.detailsTerm}>Pieces</dt>
                <dd className={styles.detailsDefinition}>
                  {pieceCount(bundle)} ({bundle.components.length} products)
                </dd>
              </div>
            </dl>
          )}
          <div className={styles.reviewsCard}>
            <span className={styles.reviewsTitle}>Reviews</span>
            <p className={styles.reviewsBody}>
              No reviews yet. Reviews come from verified buyers and are checked before they appear.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

/** The standalone product's name when the sample links the component to one. */
function standaloneName(component: StorefrontBundle['components'][number]): string {
  const product = component.productSlug ? getCatalogProduct(component.productSlug) : undefined;
  return product?.name ?? component.name;
}

/** "Ceramic burr, walnut knob · EGP 1,450 on its own" from the product record. */
function ownLine(component: StorefrontBundle['components'][number]): string {
  const product = component.productSlug ? getCatalogProduct(component.productSlug) : undefined;
  const note = component.ownNote ?? component.lineShort ?? '';
  const price = product ? formatMoney(product.price) : null;
  const each = component.quantity > 1 ? ' each' : '';
  if (note && price) return `${note} · ${price}${each} on its own`;
  if (price) return `${price}${each} on its own`;
  return note;
}

function pieceCount(bundle: StorefrontBundle): number {
  return bundle.components.reduce((sum, component) => sum + component.quantity, 0);
}
