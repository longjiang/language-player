import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['apps/web/src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'apps/web/src'),
      '@langplayer/shared': path.resolve(__dirname, 'packages/shared/src'),
      '@langplayer/api-client': path.resolve(__dirname, 'packages/api-client/src'),
    },
  },
});
