import type { Metadata, Viewport } from 'next';
import { StorefrontShell } from '../components/providers/StorefrontShell';
import { MOTION_PREPAINT_SCRIPT } from '../motion/prepaint';
import './globals.css';
import '../motion/motion.css';

export const metadata: Metadata = {
  title: 'Nordhaven Commerce — Cookware, tableware and home essentials',
  description:
    'Enamelled cast iron, stoneware, olive wood and linen for daily use. Every price shown clearly in Egyptian pounds (EGP).',
  applicationName: 'Nordhaven Commerce',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FAF8F4',
  /*
   * The storefront is a fixed light design with no dark variant. Declaring
   * "only light" opts the page out of Chrome's Auto Dark Theme (and keeps UA
   * form controls, scrollbars and the canvas light) when the OS is dark.
   */
  colorScheme: 'only light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* F07: marks the page motion-capable before first paint (see motion/motion.css). */}
        <script dangerouslySetInnerHTML={{ __html: MOTION_PREPAINT_SCRIPT }} />
      </head>
      <body>
        <StorefrontShell>
          {process.env.NORDHAVEN_DEMO === '1' ? (
            <div className="nordhaven-demo-note">
              Portfolio preview · Sample catalogue · Orders and payments are disabled
            </div>
          ) : null}
          {children}
        </StorefrontShell>
      </body>
    </html>
  );
}
