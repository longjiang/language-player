#!/usr/bin/env node
/**
 * Build, record, and retain a dev build per SPEC-076 § 4.8.
 *
 * Usage:
 *   node scripts/dev-build.mjs <ios-sim|ios-device|android>
 *     [--api-url <url>] [--keep <N>] [--allow-dirty] [--dry-run]
 *
 * Platforms:
 *   ios-sim     Release build for the iOS Simulator (no signing) → .zip of the .app
 *   ios-device  Release build for a physical device (Apple Development signing) → .zip of the .app
 *   android     Release AAB-less APK (`assembleRelease`) → .apk
 *
 * Every dev build:
 *   - refuses a dirty git tree unless --allow-dirty (a dirty build cannot be
 *     said to mirror a commit "for sure"; the row is marked `(dirty)`);
 *   - embeds the full commit SHA via EXPO_PUBLIC_GIT_SHA (Metro inlines it
 *     because apps/mobile/components/about/AboutDialog.tsx reads it), so the
 *     artifact is grep-verifiable against this ledger;
 *   - pins the API URL via EXPO_PUBLIC_API_URL (defaults to the iOS
 *     simulator loopback; physical devices/Android need --api-url, e.g. the
 *     Mac's LAN IP or 10.0.2.2 for the Android emulator);
 *   - records a row in docs/versioning/dev-build-ledger.md (number N = last + 1,
 *     never reused) with artifact SHA-256;
 *   - keeps only the <--keep> most recent builds (default 3: current + 2
 *     previous) at $LP_DEV_BUILD_DIR or ~/Desktop/LP-DevBuilds/, moving older
 *     artifacts to archive/ and marking their rows `archived`.
 *
 * Verify afterwards: node scripts/verify-dev-build.mjs <N|latest>
 */

import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const MOBILE = join(ROOT, 'apps/mobile');
const LEDGER = join(ROOT, 'docs/versioning/dev-build-ledger.md');
const STORE_DIR = process.env.LP_DEV_BUILD_DIR || join(homedir(), 'Desktop/LP-DevBuilds');
const ARCHIVE_DIR = join(STORE_DIR, 'archive');

const PLATFORMS = ['ios-sim', 'ios-device', 'android'];
const ROW_RE = /^\|\s*(\d+)\s*\|/;

// ── Helpers ──────────────────────────────────────

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function sh(cmd, opts = {}) {
  return execSync(cmd, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  }).trim();
}

function sha256(file) {
  return createHash('sha256')
    .update(readFileSync(file))
    .digest('hex');
}

function parseRows() {
  if (!existsSync(LEDGER)) return { header: [], rows: [] };
  const lines = readFileSync(LEDGER, 'utf8').split('\n');
  const header = [];
  const rows = [];
  for (const line of lines) {
    if (!ROW_RE.test(line)) {
      header.push(line);
      continue;
    }
    const cols = line.split('|').map((c) => c.trim());
    // [ '', N, platform, commit, describe, date, artifact, sha256, status, '' ]
    rows.push({
      n: Number(cols[1]),
      platform: cols[2],
      commit: cols[3],
      describe: cols[4],
      date: cols[5],
      artifact: cols[6],
      sha256: cols[7],
      status: cols[8],
    });
  }
  return { header, rows };
}

function renderLedger(header, rows) {
  const lines = [...header];
  for (const r of rows) {
    lines.push(
      `| ${r.n} | ${r.platform} | ${r.commit} | ${r.describe} | ${r.date} | ${r.artifact} | ${r.sha256} | ${r.status} |`,
    );
  }
  return lines.join('\n') + '\n';
}

function gitState() {
  const commit = sh('git rev-parse HEAD');
  const short = sh('git rev-parse --short=12 HEAD');
  let describe = '';
  try {
    describe = sh('git describe --tags --always --dirty');
  } catch {
    describe = short;
  }
  const dirty = sh('git status --porcelain').length > 0;
  return { commit, short, describe, dirty };
}

// ── Main ──────────────────────────────────────

const args = process.argv.slice(2);
const platform = args.find((a) => PLATFORMS.includes(a));
if (!platform) {
  fail(
    'Usage: node scripts/dev-build.mjs <ios-sim|ios-device|android> [--api-url <url>] [--keep <N>] [--allow-dirty] [--dry-run]',
  );
}

const apiUrl = (() => {
  const i = args.indexOf('--api-url');
  const explicit = i >= 0 ? args[i + 1] : null;
  if (explicit) return explicit;
  if (platform === 'ios-sim') return 'http://127.0.0.1:5001';
  fail(
    `${platform} needs --api-url (e.g. http://<mac-lan-ip>:5001 for physical devices, http://10.0.2.2:5001 for the Android emulator). iOS Simulator defaults to http://127.0.0.1:5001.`,
  );
})();

const keep = (() => {
  const i = args.indexOf('--keep');
  const v = i >= 0 ? Number(args[i + 1]) : 3;
  if (!Number.isInteger(v) || v < 1) fail('--keep must be a positive integer');
  return v;
})();

const dryRun = args.includes('--dry-run');
const allowDirty = args.includes('--allow-dirty');

const git = gitState();
if (git.dirty && !allowDirty) {
  fail(
    `Working tree is dirty — a dev build must mirror a commit exactly. Commit or stash first, or pass --allow-dirty (the row will be marked "(dirty)" and does not mirror the commit for sure).`,
  );
}
const status = git.dirty ? 'active (dirty)' : 'active';

const { header, rows } = parseRows();
const n = rows.reduce((max, r) => Math.max(max, r.n), 0) + 1;
const short = git.short;
const ext = platform === 'android' ? 'apk' : 'zip';
const artifactName = `lp-dev-${n}-${platform}-${short}.${ext}`;
const date = new Date().toISOString().slice(0, 10);

console.log(`Dev build ${n} — ${platform}`);
console.log(`  commit   : ${git.commit} (${git.describe})${git.dirty ? ' ⚠ dirty tree' : ''}`);
console.log(`  api-url  : ${apiUrl}`);
console.log(`  artifact : ${join(STORE_DIR, artifactName)}`);

if (dryRun) {
  console.log('\nDry run — no build, no ledger write, no retention changes.');
  process.exit(0);
}

// ── Build ──────────────────────────────────────

mkdirSync(STORE_DIR, { recursive: true });
const env = {
  ...process.env,
  EXPO_PUBLIC_GIT_SHA: git.commit,
  EXPO_PUBLIC_API_URL: apiUrl,
};

let product; // path to the .app (ios) or .apk (android)

if (platform === 'ios-sim' || platform === 'ios-device') {
  const dest = platform === 'ios-sim' ? 'generic/platform=iOS Simulator' : 'generic/platform=iOS';
  const cfg = platform === 'ios-sim' ? [] : ['-allowProvisioningUpdates'];
  console.log('\nBuilding (xcodebuild Release, this takes a while)…');
  sh(
    [
      'xcodebuild',
      '-workspace ios/LanguagePlayer3.xcworkspace',
      '-scheme LanguagePlayer3',
      '-configuration Release',
      `-destination '${dest}'`,
      '-derivedDataPath build/devbuild',
      ...cfg,
      'build -jobs 4',
    ].join(' '),
    { cwd: MOBILE, env },
  );
  const sdk = platform === 'ios-sim' ? 'Release-iphonesimulator' : 'Release-iphoneos';
  product = join(MOBILE, `build/devbuild/Build/Products/${sdk}/LanguagePlayer3.app`);
  if (!existsSync(product)) fail(`Build finished but product missing: ${product}`);
} else {
  console.log('\nBuilding (assembleRelease, this takes a while)…');
  sh('./gradlew assembleRelease --console=plain', { cwd: join(MOBILE, 'android'), env });
  product = join(MOBILE, 'android/app/build/outputs/apk/release/app-release.apk');
  if (!existsSync(product)) fail(`Build finished but APK missing: ${product}`);
}

// ── Stage into the store ──────────────────────

const staged = join(STORE_DIR, artifactName);
if (platform === 'android') {
  sh(`cp '${product}' '${staged}'`);
} else {
  sh(`ditto -c -k --keepParent '${product}' '${staged}'`);
}
const digest = sha256(staged);
console.log(`  staged   : ${staged}`);
console.log(`  sha256   : ${digest}`);

// ── Record ──────────────────────────────────────

rows.push({
  n,
  platform,
  commit: git.commit,
  describe: git.describe,
  date,
  artifact: artifactName,
  sha256: digest,
  status,
});
writeFileSync(LEDGER, renderLedger(header, rows));
console.log(`  recorded : docs/versioning/dev-build-ledger.md (N=${n})`);

// ── Retention: keep the <keep> newest, archive the rest ──

mkdirSync(ARCHIVE_DIR, { recursive: true });
const active = rows.filter((r) => r.status.startsWith('active')).sort((a, b) => b.n - a.n);
let retired = 0;
for (const r of active.slice(keep)) {
  const from = join(STORE_DIR, r.artifact);
  if (existsSync(from)) {
    renameSync(from, join(ARCHIVE_DIR, r.artifact));
    console.log(`  archived : ${r.artifact} → archive/`);
  }
  r.status = 'archived';
  retired++;
}
if (retired > 0) {
  writeFileSync(LEDGER, renderLedger(header, rows));
}

console.log(`\nDone. ${active.length} active build(s) kept, ${retired} archived.`);
console.log(`Verify: node scripts/verify-dev-build.mjs ${n}`);
