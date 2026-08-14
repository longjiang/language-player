/**
 * Shared helpers for the SPEC-076 versioning tooling.
 *
 * - One product version (SemVer MAJOR.MINOR.PATCH) for web + mobile, stored
 *   in packages/shared/src/version.json (re-exported by version.ts and read
 *   directly by apps/mobile/app.config.js).
 * - One shared, monotonic store build number for iOS + Android, also in
 *   version.json; consumed numbers are recorded in
 *   docs/versioning/build-ledger.md.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));

export const paths = {
  root: resolve(here, '..'),
  sharedVersionJson: resolve(here, '../packages/shared/src/version.json'),
  webPackage: resolve(here, '../apps/web/package.json'),
  mobileAppConfig: resolve(here, '../apps/mobile/app.config.js'),
  ledger: resolve(here, '../docs/versioning/build-ledger.md'),
  iosInfoPlist: resolve(here, '../apps/mobile/ios/LanguagePlayer3/Info.plist'),
  androidBuildGradle: resolve(here, '../apps/mobile/android/app/build.gradle'),
};

export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function writeJson(file, data) {
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

export function readSharedVersion() {
  return readJson(paths.sharedVersionJson).PRODUCT_VERSION;
}

export function readSharedBuildNumber() {
  return readJson(paths.sharedVersionJson).PRODUCT_BUILD_NUMBER;
}

export function writeSharedVersionJson(version, buildNumber) {
  writeJson(paths.sharedVersionJson, {
    PRODUCT_VERSION: version,
    PRODUCT_BUILD_NUMBER: buildNumber,
  });
}

export function readWebVersion() {
  return readJson(paths.webPackage).version;
}

export function readMobileConfig() {
  return {
    version: readSharedVersion(),
    iosBuildNumber: String(readSharedBuildNumber()),
    androidVersionCode: readSharedBuildNumber(),
  };
}

export function parseSemver(value) {
  const match = String(value).trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Invalid MAJOR.MINOR.PATCH version: ${value}`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function compareVersions(a, b) {
  const left = parseSemver(a);
  const right = parseSemver(b);
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] - right[key];
  }
  return 0;
}

const LEDGER_HEADER = [
  '# Build Number Ledger',
  '',
  'Consumed store build numbers for Language Player 3 (`ca.zerotohero.go`).',
  '',
  'SPEC-076: every upload to any track of either store consumes a number —',
  'even if the build is later rejected, archived, or rolled back. iOS',
  '(`ios.buildNumber`) and Android (`android.versionCode`) share one number',
  'per product release; never reuse or decrease a number.',
  '',
  '| N | Platform / track | Version | Date | Status |',
  '|---|---|---|---|---|',
].join('\n');

export function parseLedger() {
  const rows = [];
  if (!existsSync(paths.ledger)) return rows;
  const text = readFileSync(paths.ledger, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) continue;
    const cells = trimmed
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length !== 5) continue;
    const n = Number(cells[0]);
    if (!Number.isInteger(n) || n <= 0) continue;
    const platform = /^iOS/i.test(cells[1])
      ? 'ios'
      : /^Android/i.test(cells[1])
        ? 'android'
        : null;
    if (!platform) continue;
    rows.push({
      n,
      platform,
      label: cells[1],
      version: cells[2],
      date: cells[3],
      status: cells[4],
    });
  }
  return rows;
}

export function ledgerMax(rows, platform) {
  return rows
    .filter((row) => row.platform === platform)
    .reduce((max, row) => Math.max(max, row.n), 0);
}

export function writeLedger(rows) {
  const lines = rows
    .slice()
    .sort((a, b) => a.n - b.n || a.platform.localeCompare(b.platform))
    .map(
      (row) =>
        `| ${row.n} | ${row.label} | ${row.version} | ${row.date} | ${row.status} |`,
    );
  writeFileSync(paths.ledger, LEDGER_HEADER + '\n' + lines.join('\n') + '\n');
}

export function isDryRun(argv) {
  return argv.includes('--dry-run');
}
