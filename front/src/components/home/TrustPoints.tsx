import { Icon, type IconName } from '../ui/Icon';
import type { TrustPoint } from '../../data/types';
import styles from './TrustPoints.module.css';

const ICONS: Record<TrustPoint['icon'], IconName> = {
  price: 'coin',
  wishlist: 'heart',
  sets: 'package',
};

export function TrustPoints({ points }: { points: TrustPoint[] }) {
  return (
    <section className={styles.section} aria-labelledby="hw-trust-heading">
      <div className={styles.headingRow}>
        <h2 id="hw-trust-heading" className={styles.heading} data-split="words">
          Shopping with us
        </h2>
      </div>
      <div className={styles.grid} data-reveal-stagger>
        {points.map((point) => (
          <div key={point.title} className={styles.item}>
            <Icon name={ICONS[point.icon]} size={26} strokeWidth={1.5} className={styles.icon} />
            <span className={styles.text}>
              <strong className={styles.title}>{point.title}</strong>
              <span className={styles.body}>
                <span className="hw-wide">{point.body}</span>
                <span className="hw-narrow">{point.bodyShort}</span>
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
