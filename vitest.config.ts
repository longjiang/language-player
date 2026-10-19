import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // Match Next.js's automatic JSX runtime. Without this, Vite's esbuild
  // defaults to the classic runtime and any tested component that doesn't
  // `import React` (most of apps/web) throws "React is not defined".
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    globals: true,
    include: [
      'apps/web/src/**/*.test.{ts,tsx}',
      'apps/mobile/lib/**/*.test.{ts,tsx}',
      'packages/shared/src/**/*.test.{ts,tsx}',
      'packages/utils/src/**/*.test.{ts,tsx}',
      'packages/textbooks/src/**/*.test.{ts,tsx}',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'apps/web/src'),
      '@langplayer/shared': path.resolve(__dirname, 'packages/shared/src'),
      '@langplayer/api-client': path.resolve(__dirname, 'packages/api-client/src'),
      '@langplayer/utils': path.resolve(__dirname, 'packages/utils/src'),
      '@langplayer/textbooks': path.resolve(__dirname, 'packages/textbooks/src'),
    },
  },
});
