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
  webpack: (config, { dev }) => {
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
