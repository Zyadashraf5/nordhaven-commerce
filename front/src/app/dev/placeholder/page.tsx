import { notFound } from 'next/navigation';
import Link from 'next/link';
import styles from './page.module.css';

/**
 * Development-only placeholder route.
 *
 * Stage 1 only covers the homepage. Every link that would leave the homepage
 * points here so nothing pretends that a product, cart, checkout or account
 * screen exists. The route 404s in a production build.
 */
export const dynamic = 'force-dynamic';

export default async function PlaceholderPage({
  searchParams,
}: {
  searchParams: Promise<{ for?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  const params = await searchParams;
  const target = params.for ?? 'a screen that has not been designed yet';

  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>Not implemented yet</p>
      <h1 className={styles.title}>This screen belongs to a later milestone</h1>
      <p className={styles.body}>
        The approved Stage 1 design covers the homepage only. This link is a development-only
        placeholder so nothing pretends to work.
      </p>
      <p className={styles.target}>
        Destination: <strong>{target}</strong>
      </p>
      <Link className={styles.back} href="/">
        Back to the homepage
      </Link>
    </main>
  );
}
