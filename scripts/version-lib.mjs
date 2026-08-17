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
  '# Build Ledger',
  '',
  'Every build of Language Player 3 (`ca.zerotohero.go`): store/TestFlight',
  'uploads and dev (Debug) builds, one row per commit, chronological.',
  '',
  '- **Store / TestFlight builds** — every upload to any track of either',
  '  store, sharing one monotonic build number: `3.1.2 — iOS TestFlight (b5,',
  '  consumed) · Android Internal testing (b5, consumed)`. Numbers are never',
  '  reused or decreased (SPEC-076).',
  '- **Dev builds** — always **Debug** configuration (Metro-connected; JS',
  '  served at runtime). Never Release configuration. Format: `dev 4 (Debug;',
  '  active; lp-dev-4-….zip; <sha256>)`. Retention keeps the 3 most recent',
  '  dev builds recoverable in `.dev-builds/` (override: `LP_DEV_BUILD_DIR`);',
  '  older artifacts move to `.dev-builds/archive/` and are marked archived.',
  '  Rows 1–2 are the only historical Release-config dev builds (legacy,',
  '  archived) — no new ones, ever.',
  '',
  '| # | Commit | Date | Store / TestFlight builds | Dev builds |',
  '|---|---|---|---|---|',
].join('\n');

export function parseLedger() {
  const rows = [];
  if (!existsSync(paths.ledger)) return rows;
  for (const line of readFileSync(paths.ledger, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) continue;
    const cells = trimmed
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length !== 5) continue;
    if (!/^[0-9a-f]{7,40}$/.test(cells[1])) continue; // commit column
    const store = cells[3] === '—' ? '' : cells[3];
    const dev = cells[4] === '—' ? '' : cells[4];
    rows.push({
      idx: Number(cells[0]),
      commit: cells[1],
      date: cells[2],
      store,
      dev,
      storeEntries: parseStoreCell(store),
      devBuilds: parseDevCell(dev),
    });
  }
  return rows;
}

/** Parse a store cell: `3.1.2 — iOS TestFlight (b5, consumed) · Android Internal testing (b5, consumed)`. */
export function parseStoreCell(cell) {
  if (!cell) return [];
  const version = (cell.match(/(\d+\.\d+\.\d+)/) || [])[1] || '';
  const entries = [];
  const entryRe = /([A-Za-z][A-Za-z0-9 /-]*?) \((b\d+), ([^)]+)\)/g;
  let m;
  while ((m = entryRe.exec(cell))) {
    const label = m[1].trim();
    entries.push({
      version,
      b: Number(m[2].slice(1)),
      label,
      platform: /^iOS/i.test(label) ? 'ios' : /^Android/i.test(label) ? 'android' : null,
      status: m[3].trim(),
    });
  }
  return entries;
}

/** Parse a dev cell: `dev 4 (Debug; active; lp-dev-4-….zip; <sha256>) · dev 5 (… )`. */
export function parseDevCell(cell) {
  if (!cell) return [];
  const out = [];
  const tokenRe = /dev (\d+) \(([^;]+); ([^;]+); ([^;]+); ([0-9a-f]{64})\)/g;
  let m;
  while ((m = tokenRe.exec(cell))) {
    out.push({
      n: Number(m[1]),
      kind: m[2].trim(),
      status: m[3].trim(),
      artifact: m[4].trim(),
      sha: m[5],
    });
  }
  return out;
}

export function ledgerMax(rows, platform) {
  return rows
    .flatMap((row) => row.storeEntries)
    .filter((entry) => entry.platform === platform)
    .reduce((max, entry) => Math.max(max, entry.b), 0);
}

export function writeLedger(rows) {
  const lines = rows.map(
    (row, i) =>
      `| ${i + 1} | ${row.commit} | ${row.date} | ${row.store || '—'} | ${row.dev || '—'} |`,
  );
  writeFileSync(paths.ledger, LEDGER_HEADER + '\n' + lines.join('\n') + '\n');
}

export function isDryRun(argv) {
  return argv.includes('--dry-run');
}
