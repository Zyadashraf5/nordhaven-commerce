import Link from 'next/link';
import type { HomepageData } from '../../data/types';
import styles from './SiteFooter.module.css';

export function SiteFooter({ footer }: { footer: HomepageData['footer'] }) {
  return (
    <footer className={styles.footer}>
      {/* wide layout */}
      <div className={styles.inner}>
        <div className={styles.columns}>
          <div className={styles.brand}>
            <span className={styles.brandName}>Nordhaven</span>
            <span className={styles.tagline}>{footer.tagline}</span>
          </div>
          {footer.columns.map((column) => (
            <nav key={column.title} aria-label={column.title} className={styles.column}>
              <strong className={styles.columnTitle}>{column.title}</strong>
              {column.links.map((link) => (
                <Link key={link.label} href={link.href} className={styles.link}>
                  {link.label}
                </Link>
              ))}
            </nav>
          ))}
        </div>
        <div className={styles.bottom}>
          <span>{footer.copyright}</span>
          <span>{footer.locale}</span>
        </div>
      </div>

      {/* narrow layout */}
      <div className={styles.mobileInner}>
        <span className={styles.mobileBrandName}>Nordhaven</span>
        {footer.columns.map((column) => (
          <details key={column.title} className={styles.mobileDetails}>
            <summary>{column.title}</summary>
            <div className={styles.mobileColumnLinks}>
              {column.links.map((link) => (
                <Link key={link.label} href={link.href}>
                  {link.label}
                </Link>
              ))}
            </div>
          </details>
        ))}
        <span className={styles.mobileCopyright}>
          {footer.copyright} · {footer.locale}
        </span>
      </div>
    </footer>
  );
}
