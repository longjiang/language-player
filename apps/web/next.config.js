const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // When BUILD_CHECK=1, output to a separate directory so the build
  // doesn't corrupt the dev server's .next/ cache.  This lets you run
  // `npm run build:check -w apps/web` to verify the build while `next dev`
  // is running without conflicts.
  distDir: process.env.BUILD_CHECK === '1' ? '.next-check' : '.next',
  transpilePackages: [
    '@langplayer/shared',
    '@langplayer/api-client',
    '@langplayer/utils',
  ],
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
