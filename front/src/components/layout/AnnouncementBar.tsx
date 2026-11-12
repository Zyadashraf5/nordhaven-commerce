import type { HomepageData } from '../../data/types';
import styles from './AnnouncementBar.module.css';

export function AnnouncementBar({ announcement }: { announcement: HomepageData['announcement'] }) {
  return (
    <div className={styles.bar}>
      <div className={styles.inner}>
        <span className={styles.message}>
          <span className="hw-wide">{announcement.message}</span>
          <span className="hw-narrow">{announcement.messageShort}</span>
        </span>
        <nav aria-label="Store settings" className={styles.settings}>
          {announcement.links.map((link) => (
            <a key={link.label} href={link.href} className={styles.link}>
              {link.label}
            </a>
          ))}
          <span>{announcement.currency}</span>
          <span>{announcement.language}</span>
        </nav>
      </div>
    </div>
  );
}
