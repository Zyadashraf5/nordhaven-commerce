'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Magnet } from '../../motion/reactbits/Magnet';
import { Icon } from '../ui/Icon';
import { StorefrontImage } from '../ui/StorefrontImage';
import { formatMoney } from '../../data/money';
import { routes } from '../../lib/links';
import type { HeroContent } from '../../data/types';
import styles from './HeroSection.module.css';

export function HeroSection({ hero }: { hero: HeroContent }) {
  const [activeHotspotId, setActiveHotspotId] = useState(hero.hotspots[0]?.id ?? '');
  const active =
    hero.hotspots.find((hotspot) => hotspot.id === activeHotspotId) ?? hero.hotspots[0];

  return (
    <section className={styles.section}>
      <div className={styles.copy}>
        <div className={styles.eyebrowRow} data-intro>
          <span className={styles.eyebrow}>{hero.eyebrow}</span>
        </div>
        <h1 className={styles.title} data-intro data-split="words">
          {hero.title} <em className="hw-display-em">{hero.titleEmphasis}</em>
        </h1>
        <p className={styles.body} data-intro>
          <span className="hw-wide">{hero.body}</span>
          <span className="hw-narrow">{hero.bodyShort}</span>
        </p>
        <div className={styles.actions} data-intro>
          <Magnet>
            <Link href={routes.category('cookware')} className={styles.primaryAction}>
              Shop cookware
              <Icon name="arrow-right" size={18} strokeWidth={2} />
            </Link>
          </Magnet>
          <Link href={routes.category('sets-and-bundles')} className={styles.secondaryAction}>
            Explore ready-packed sets
          </Link>
          <Link href={routes.products} className={styles.mobileSecondaryAction}>
            Shop all
          </Link>
        </div>
      </div>

      <figure className={styles.figure} data-intro="image">
        <StorefrontImage
          image={hero.image}
          fill
          priority
          sizes="(max-width: 1023px) 100vw, 50vw"
          className={styles.image}
        />
        {hero.hotspots.map((hotspot) => (
          <button
            key={hotspot.id}
            type="button"
            aria-label={`Show ${hotspot.name}`}
            aria-pressed={hotspot.id === active?.id}
            className={styles.hotspot}
            style={{ left: `${hotspot.x}%`, top: `${hotspot.y}%` }}
            onClick={() => setActiveHotspotId(hotspot.id)}
          >
            <span
              className={`${styles.hotspotDot} ${
                hotspot.id === active?.id ? styles.hotspotDotActive : ''
              }`}
            />
          </button>
        ))}
        {active ? (
          <Link href={routes.product(active.productSlug)} className={styles.productChip}>
            <StorefrontImage
              image={active.image}
              alt=""
              className={styles.productChipImage}
              sizes="56px"
            />
            <span className={styles.productChipText}>
              <span className={styles.productChipName}>
                <span className="hw-wide">{active.name}</span>
                <span className="hw-narrow">{hero.mobileChip.name}</span>
              </span>
              <span className={styles.productChipPriceRow}>
                <span
                  className={`${styles.productChipPrice} ${
                    active.previousPrice ? styles.productChipPriceOffer : ''
                  }`}
                >
                  {formatMoney(active.price)}
                </span>
                {active.previousPrice ? (
                  <>
                    <s className={styles.productChipWasFull}>{formatMoney(active.previousPrice)}</s>
                    <s className={styles.productChipWasCompact}>
                      {formatMoney(active.previousPrice, { withCurrency: false })}
                    </s>
                  </>
                ) : null}
              </span>
            </span>
            <Icon name="arrow-right" size={18} strokeWidth={1.8} />
          </Link>
        ) : null}
      </figure>
    </section>
  );
}
