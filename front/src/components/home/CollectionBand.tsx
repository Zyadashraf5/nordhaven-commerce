import Link from 'next/link';
import { formatMoney } from '../../data/money';
import { placeholderHref } from '../../lib/links';
import { StorefrontImage } from '../ui/StorefrontImage';
import type { StorefrontCollection } from '../../data/types';
import styles from './CollectionBand.module.css';

export function CollectionBand({ collection }: { collection: StorefrontCollection }) {
  return (
    <section className={styles.band} aria-labelledby="hw-collection-heading">
      <div className={styles.inner}>
        <figure className={styles.figure} data-parallax="5">
          <StorefrontImage
            image={collection.image}
            fill
            sizes="(max-width: 1023px) 100vw, 50vw"
            className={styles.image}
          />
        </figure>
        <div className={styles.content} data-reveal>
          <div className={styles.eyebrowRow}>
            <span className={styles.eyebrow}>{collection.eyebrow}</span>
          </div>
          <h2 id="hw-collection-heading" className={styles.heading}>
            {collection.title} <em className="hw-display-em">{collection.titleEmphasis}</em>
            {collection.titleSuffix}
          </h2>
          <p className={styles.body}>
            <span className="hw-wide">{collection.body}</span>
            <span className="hw-narrow">{collection.bodyShort}</span>
          </p>
          <ul className={styles.items}>
            {collection.items.map((item) => (
              <li key={item.id} className={styles.item}>
                <StorefrontImage
                  image={item.image}
                  alt=""
                  className={styles.itemImage}
                  sizes="56px"
                />
                <Link href={item.href} className={styles.itemName}>
                  {item.name}
                </Link>
                <span className={styles.itemPrice}>{formatMoney(item.price)}</span>
              </li>
            ))}
          </ul>
          <div>
            <Link href={placeholderHref('The slow Sunday table')} className={styles.cta}>
              Shop the collection
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
