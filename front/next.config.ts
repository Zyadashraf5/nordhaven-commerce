import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  // The storefront serves its own small, pre-compressed WebP files from /public.
  // The image optimizer is switched off so the app deploys anywhere without
  // native image binaries and no request ever leaves the storefront's origin.
  images: {
    unoptimized: true,
  },
  // The storefront is a separate, independently deployable application. It never
  // rewrites unknown paths, so unimplemented sections keep their real URLs.
  headers() {
    return Promise.resolve([
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]);
  },
};

export default nextConfig;
