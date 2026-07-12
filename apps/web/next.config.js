/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
        // Proxy /api/* to the Python backend during development
        source: '/api/python/:path*',
        destination: 'http://localhost:5001/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
