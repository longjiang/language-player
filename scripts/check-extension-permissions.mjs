/**
 * SPEC-086 / SPEC-074 permission regression check.
 *
 * The extension redesign may change UI and bundled behavior, but it must not
 * expand the Chrome Web Store permission footprint. Keep this baseline in
 * source control and require an explicit separate decision/spec for changes.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const manifestPath = resolve(root, 'apps/chrome-extension/manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const EXPECTED_PERMISSIONS = [
  'sidePanel',
  'scripting',
  'storage',
  'tabs',
  'webRequest',
];
const EXPECTED_HOST_PERMISSIONS = ['http://*/*', 'https://*/*'];
const EXPECTED_RESOURCE_MATCHES = [
  'https://*.primevideo.com/*',
  'https://*.amazon.com/*',
  'https://*.amazon.co.uk/*',
  'https://*.amazon.de/*',
  'https://*.amazon.co.jp/*',
  '*://*.youtube.com/*',
  '*://*.netflix.com/*',
  '*://*.disneyplus.com/*',
  '*://*.hulu.com/*',
  '*://*.max.com/*',
  '*://play.max.com/*',
  'http://*/*',
  'https://*/*',
];

function sorted(values) {
  return [...(values ?? [])].sort();
}

function assertEqual(label, actual, expected) {
  const actualJson = JSON.stringify(sorted(actual));
  const expectedJson = JSON.stringify(sorted(expected));
  if (actualJson !== expectedJson) {
    throw new Error(`${label} changed: expected ${expectedJson}, received ${actualJson}`);
  }
}

assertEqual('permissions', manifest.permissions, EXPECTED_PERMISSIONS);
assertEqual('host_permissions', manifest.host_permissions, EXPECTED_HOST_PERMISSIONS);
assertEqual('optional_permissions', manifest.optional_permissions, []);

if (manifest.action?.default_popup) {
  console.error('[LP Extension] Permission check note: action.default_popup is still present; Phase 1 must remove it.');
}

const resources = manifest.web_accessible_resources ?? [];
if (resources.length !== 1) {
  throw new Error(`web_accessible_resources changed: expected one resource rule, received ${resources.length}`);
}

const resourceRule = resources[0];
if (JSON.stringify(sorted(resourceRule.resources)) !== JSON.stringify(sorted([
  'src/language-player-logo-64.png',
  'dist/netflix-main-world.js',
  'src/page-dictionary-frame.html',
  'dist/content.css',
  'dist/sidepanel.css',
  'dist/page-dictionary.css',
  'dist/page-dictionary-frame.js',
  '_locales/*.json',
]))) {
  throw new Error('web_accessible_resources.resources changed');
}

assertEqual('web_accessible_resources.matches', resourceRule.matches, EXPECTED_RESOURCE_MATCHES);

console.log('[LP Extension] Permission baseline passed');
