const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Dev-only: let browsers on other devices (e.g. an iPad on the same LAN)
  // load the app via the machine's LAN IP. `next dev` blocks requests to
  // /_next/* and the HMR websocket when the Origin host isn't localhost
  // (block-cross-site-dev.js); listing the LAN IP here unblocks it. If the
  // machine's IP changes (DHCP), override via ALLOWED_DEV_ORIGINS
  // (comma-separated) instead of editing this array.
  allowedDevOrigins: (process.env.ALLOWED_DEV_ORIGINS ?? '192.168.1.130')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
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
