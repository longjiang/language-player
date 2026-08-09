import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Mobile-focused vitest config (SPEC-058).
 *
 * The root vitest.config.ts aliases `@` to `apps/web/src`, which is wrong
 * for mobile modules. This config aliases `@` to `apps/mobile` and includes
 * only mobile tests, with the tokenizer-eval setup (mocks + Node shims).
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['apps/mobile/**/*.test.ts'],
    setupFiles: ['apps/mobile/tests/tokenizer-eval/setup.ts'],
    timeout: 120_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'apps/mobile'),
      '@langplayer/shared': path.resolve(__dirname, 'packages/shared/src'),
      '@langplayer/api-client': path.resolve(__dirname, 'packages/api-client/src'),
      '@langplayer/utils': path.resolve(__dirname, 'packages/utils/src'),
    },
  },
});
