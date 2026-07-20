/**
 * Build script for the Prime Video Subtitle extension.
 *
 * Uses esbuild to bundle React + shared packages into a single content script.
 * Run from the monorepo root:
 *   node extensions/prime-video-subtitles/build.mjs
 *
 * Output: extensions/prime-video-subtitles/dist/content.js
 */

import * as esbuild from 'esbuild';
import { readFileSync, copyFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

const outDir = resolve(__dirname, 'dist');
mkdirSync(outDir, { recursive: true });

console.log('[build] Bundling content script...');

const result = await esbuild.build({
  entryPoints: [resolve(__dirname, 'src/content-entry.js')],
  bundle: true,
  outfile: resolve(outDir, 'content.js'),
  format: 'iife',
  target: ['chrome120'],
  platform: 'browser',
  // React JSX automatic runtime
  jsx: 'automatic',
  // Resolve @langplayer/* workspace packages from the monorepo root
  alias: {
    '@langplayer/shared': resolve(root, 'packages/shared/src'),
    '@langplayer/utils': resolve(root, 'packages/utils/src'),
  },
  // Shared packages are pure TypeScript — define() handles tree-shaking
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  // Don't bundle these — Chrome extension provides them
  external: ['chrome'],
  minify: false, // keep readable for debugging
  sourcemap: false,
});

if (result.errors.length > 0) {
  console.error('[build] Errors:', result.errors);
  process.exit(1);
}
if (result.warnings.length > 0) {
  console.warn('[build] Warnings:', result.warnings);
}

// Copy CSS
copyFileSync(
  resolve(__dirname, 'src/content.css'),
  resolve(outDir, 'content.css'),
);
console.log('[build] Copied content.css');

// Read and log output size
const stats = readFileSync(resolve(outDir, 'content.js'));
console.log(`[build] Done — dist/content.js (${(stats.length / 1024).toFixed(1)} KB)`);
