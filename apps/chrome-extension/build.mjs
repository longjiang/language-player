/**
 * Build script for the Language Player browser extension.
 *
 * Uses esbuild to bundle React + shared packages into a single content script.
 * Run from the monorepo root:
 *   node apps/chrome-extension/build.mjs
 *
 * Output: apps/chrome-extension/dist/content.js
 */

import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');
const manifestPath = resolve(__dirname, 'manifest.json');
const outDir = resolve(__dirname, 'dist');
mkdirSync(outDir, { recursive: true });

// Step 1: Generate language name translations from monorepo CSV
console.log('[build] Generating language name translations...');
execSync('node scripts/generate-lang-names.js', {
  cwd: __dirname,
  stdio: 'inherit',
});

// Read current version from manifest (for the generated-file banner)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
const currentVersion = manifest.version;

// Step 2: Bundle content script
console.log('[build] Bundling content script...');

const banner = [
  '/**',
  ` * LANGUAGE PLAYER — Chrome Extension Content Script v${currentVersion}`,
  ' *',
  ' * ⚠️  THIS IS A GENERATED FILE — DO NOT EDIT DIRECTLY.',
  ' * Source: apps/chrome-extension/src/content-entry.js',
  ' * Build:  node apps/chrome-extension/build.mjs',
  ' *',
  ' * Bundled with esbuild from content-entry.js + shared packages.',
  ' * Platform detection, subtitle parsing, React transcript panel.',
  ' */',
  '',
].join('\n');

const result = await esbuild.build({
  entryPoints: [resolve(__dirname, 'src/content-entry.js')],
  bundle: true,
  outfile: resolve(outDir, 'content.js'),
  banner: { js: banner },
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

// Step 2b: Bundle language options for the popup (vanilla JS popup loads this)
console.log('[build] Bundling popup language options...');

const popupOptionsResult = await esbuild.build({
  entryPoints: [resolve(__dirname, 'src/popup-options.js')],
  bundle: true,
  outfile: resolve(outDir, 'popup-options.js'),
  banner: { js: banner },
  format: 'iife',
  target: ['chrome120'],
  platform: 'browser',
  alias: {
    '@langplayer/shared': resolve(root, 'packages/shared/src'),
    '@langplayer/utils': resolve(root, 'packages/utils/src'),
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  external: ['chrome'],
  minify: false,
  sourcemap: false,
});

if (popupOptionsResult.errors.length > 0) {
  console.error('[build] Popup options errors:', popupOptionsResult.errors);
  process.exit(1);
}
if (popupOptionsResult.warnings.length > 0) {
  console.warn('[build] Popup options warnings:', popupOptionsResult.warnings);
}

// Step 2c: Bundle the popup script so it can share the auth module
// (single-flight refresh, dead-token cleanup) instead of duplicating it.
console.log('[build] Bundling popup script...');

const popupResult = await esbuild.build({
  entryPoints: [resolve(__dirname, 'src/popup.js')],
  bundle: true,
  outfile: resolve(outDir, 'popup.js'),
  banner: { js: banner },
  format: 'iife',
  target: ['chrome120'],
  platform: 'browser',
  alias: {
    '@langplayer/shared': resolve(root, 'packages/shared/src'),
    '@langplayer/utils': resolve(root, 'packages/utils/src'),
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  external: ['chrome'],
  minify: false,
  sourcemap: false,
});

if (popupResult.errors.length > 0) {
  console.error('[build] Popup errors:', popupResult.errors);
  process.exit(1);
}
if (popupResult.warnings.length > 0) {
  console.warn('[build] Popup warnings:', popupResult.warnings);
}

// Copy CSS
copyFileSync(
  resolve(__dirname, 'src/content.css'),
  resolve(outDir, 'content.css'),
);
console.log('[build] Copied content.css');

// Copy Netflix MAIN world script (injected via <script src> at document_start)
copyFileSync(
  resolve(__dirname, 'src/netflix-main-world.js'),
  resolve(outDir, 'netflix-main-world.js'),
);
console.log('[build] Copied netflix-main-world.js');

// Read and log output size
const stats = readFileSync(resolve(outDir, 'content.js'));
console.log(`[build] Done — dist/content.js (${(stats.length / 1024).toFixed(1)} KB)`);
