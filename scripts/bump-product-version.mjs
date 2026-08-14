#!/usr/bin/env node
/**
 * Bump the shared product version (web + mobile) per SPEC-076.
 *
 * Usage:
 *   node scripts/bump-product-version.mjs <major|minor|patch> [--dry-run]
 *
 * Updates, together:
 *   - packages/shared/src/version.ts (PRODUCT_VERSION)
 *   - apps/web/package.json (version)
 *   - apps/mobile/app.json (expo.version)
 *
 * Fails if the three sources have drifted (fix drift manually first).
 */

import { readFileSync, writeFileSync } from 'fs';
import {
  paths,
  readJson,
  writeJson,
  readSharedVersion,
  readWebVersion,
  readMobileConfig,
  parseSemver,
  isDryRun,
} from './version-lib.mjs';

const kind = process.argv.find((arg) =>
  ['major', 'minor', 'patch'].includes(arg),
);
if (!kind) {
  console.error(
    'Usage: node scripts/bump-product-version.mjs <major|minor|patch> [--dry-run]',
  );
  process.exit(1);
}

const dryRun = isDryRun(process.argv);
const shared = readSharedVersion();
const web = readWebVersion();
const mobile = readMobileConfig();

const drift = [];
if (web !== shared) drift.push(`apps/web/package.json (${web}) != shared (${shared})`);
if (mobile.version !== shared) drift.push(`app.json expo.version (${mobile.version}) != shared (${shared})`);
if (drift.length > 0) {
  console.error('Version drift detected — fix these first:');
  for (const problem of drift) console.error(`  - ${problem}`);
  process.exit(1);
}

const current = parseSemver(shared);
const next = { major: current.major, minor: current.minor, patch: current.patch };
if (kind === 'major') {
  next.major += 1;
  next.minor = 0;
  next.patch = 0;
} else if (kind === 'minor') {
  next.minor += 1;
  next.patch = 0;
} else {
  next.patch += 1;
}
const nextVersion = `${next.major}.${next.minor}.${next.patch}`;

if (dryRun) {
  console.log(`Would bump ${shared} -> ${nextVersion}`);
  process.exit(0);
}

const versionSource = readFileSync(paths.sharedVersion, 'utf8').replace(
  /PRODUCT_VERSION\s*=\s*'[^']+'/,
  `PRODUCT_VERSION = '${nextVersion}'`,
);
writeFileSync(paths.sharedVersion, versionSource);

const webPackage = readJson(paths.webPackage);
webPackage.version = nextVersion;
writeJson(paths.webPackage, webPackage);

const app = readJson(paths.mobileAppJson);
app.expo.version = nextVersion;
writeJson(paths.mobileAppJson, app);

console.log(`Product version bumped ${shared} -> ${nextVersion} (shared, web, app.json)`);
console.log('Next: node scripts/next-build.mjs to assign the store build number.');
