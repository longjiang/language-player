const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // When BUILD_CHECK=1, output to a separate directory so the build doesn't
  // corrupt a running dev server (same convention as apps/web).
  distDir: process.env.BUILD_CHECK === '1' ? '.next-check' : '.next',
  transpilePackages: ['@langplayer/shared', '@langplayer/utils'],
};

module.exports = withNextIntl(nextConfig);
