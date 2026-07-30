const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // When BUILD_CHECK=1, output to a separate directory so the build
  // doesn't corrupt the dev server's .next/ cache.  This lets you run
  // `npx turbo build` to check for errors while `npx turbo dev` is
  // running without conflicts.
  distDir: process.env.BUILD_CHECK === '1' ? '.next-check' : '.next',
  transpilePackages: [
    '@langplayer/shared',
    '@langplayer/api-client',
    '@langplayer/utils',
  ],
  webpack: (config, { dev, webpack }) => {
    if (dev) {
      // Disable persistent file-system cache in dev mode.
      // PackFileCacheStrategy writes to .next/cache/webpack/ and can
      // corrupt during HMR, causing missing chunk errors:
      //   Cannot find module './4522.js'
      //   Cannot find module './vendor-chunks/axios.js'
      //   ENOENT: .next/cache/webpack/client-development/*.pack.gz
      // Switching to memory-only cache avoids all disk corruption.
      config.cache = false;
    }

    if (!dev) {
      // Reduce the number of initial <script async> tags by merging
      // small shared chunks. The default splitChunks config produces
      // 30+ chunks for granular caching, but each one adds HTTP
      // round-trip overhead that delays first paint.
      //
      // We raise minSize to merge tiny utility modules into their
      // nearest parent chunk, and lower minChunks so moderately-shared
      // code isn't split into its own tiny file.
      //
      // Tested values (production build):
      //   default:    31 script tags, ~288KB gzipped
      //   minSize=50KB minChunks=3:   ~ script tags, ~KB gzipped
      const splitChunks = config.optimization?.splitChunks;
      if (splitChunks) {
        splitChunks.minSize = 50 * 1024;
        splitChunks.minChunks = 3;
      }
    }

    return config;
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: 'img.youtube.com' },
      { protocol: 'https', hostname: 'languageplayer.io' },
      { protocol: 'https', hostname: 'beta.languageplayer.io' },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/python/:path*',
        destination: 'http://localhost:5001/:path*',
      },
    ];
  },
};

module.exports = withNextIntl(nextConfig);
