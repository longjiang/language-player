#!/usr/bin/env node
/**
 * Build, record, and retain a dev build per SPEC-076 § 4.8.
 *
 * "Dev build" means DEBUG build (Metro-connected): the JS bundle is NOT
 * embedded — the app loads it from Metro at runtime, giving Fast Refresh.
 * The artifact is the compiled native shell (signed .app / debug APK) at a
 * pinned commit.
 *
 * Usage:
 *   node scripts/dev-build.mjs <ios-sim|ios-device|android>
 *     [--metro-host <ip>] [--keep <N>] [--allow-dirty] [--dry-run]
 *
 * Platforms:
 *   ios-sim     Debug build for the iOS Simulator → .zip of the .app
 *               (loads JS from localhost:8081)
 *   ios-device  Debug build for a physical device (Apple Development
 *               signing) → .zip of the .app. RN's react-native-xcode.sh
 *               writes ip.txt (the Mac's LAN IP) into the bundle, so the
 *               app connects to Metro at http://<mac-lan-ip>:8081.
 *   android     Debug APK (`assembleDebug`) → .apk
 *               (loads JS from Metro — adb reverse or the LAN URL)
 *
 * --metro-host overrides the LAN IP used by the ip.txt check for
 * ios-device; it defaults to the Mac's primary interface IP.
 *
 * Every dev build:
 *   - refuses a dirty git tree unless --allow-dirty (a dirty build cannot be
 *     said to mirror a commit "for sure"; the row is marked `(dirty)`);
 *   - records a row in docs/versioning/dev-build-ledger.md (number N = last + 1,
 *     never reused) with artifact SHA-256;
 *   - keeps only the <--keep> most recent builds (default 3: current + 2
 *     previous) at $LP_DEV_BUILD_DIR or .dev-builds/, moving older
 *     artifacts to archive/ and marking their rows `archived`.
 *
 * NOTE on JS config (EXPO_PUBLIC_*): for Debug builds these are inlined by
 * METRO at serve time, not at build time — so start Metro with the env you
 * want, e.g. `EXPO_PUBLIC_GIT_SHA=$(git rev-parse HEAD) npx expo start
 * --host lan`. The About dialog's commit row then shows the SHA.
 *
 * Verify afterwards: node scripts/verify-dev-build.mjs <N|latest>
 * (for Debug builds the embedded-bundle grep is skipped — no bundle exists;
 * SHA-256 + commit + ip.txt are checked instead).
 */

import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const MOBILE = join(ROOT, 'apps/mobile');
const LEDGER = join(ROOT, 'docs/versioning/dev-build-ledger.md');
const STORE_DIR = process.env.LP_DEV_BUILD_DIR || join(ROOT, '.dev-builds');
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

// Long build commands stream to the console (inherited stdio) instead of
// being buffered — xcodebuild/gradle output can exceed any pipe buffer
// (ENOBUFS) and never needs capturing.
function run(cmd, opts = {}) {
  execSync(cmd, {
    cwd: ROOT,
    stdio: 'inherit',
    ...opts,
  });
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
    'Usage: node scripts/dev-build.mjs <ios-sim|ios-device|android> [--metro-host <ip>] [--keep <N>] [--allow-dirty] [--dry-run]',
  );
}

// Metro host for the ip.txt check (ios-device only; Debug builds load JS from
// Metro at runtime, so there is no build-time API URL to pin).
const metroHost = (() => {
  const i = args.indexOf('--metro-host');
  if (i >= 0 && args[i + 1]) return args[i + 1];
  try {
    return sh('ipconfig getifaddr en0 || ipconfig getifaddr en1').split('\n')[0];
  } catch {
    return null;
  }
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
console.log(`  commit    : ${git.commit} (${git.describe})${git.dirty ? ' ⚠ dirty tree' : ''}`);
console.log(`  metro-host: ${metroHost ?? '(auto)'}${platform !== 'ios-device' ? ' (not used for this platform)' : ''}`);
console.log(`  artifact  : ${join(STORE_DIR, artifactName)}`);

if (dryRun) {
  console.log('\nDry run — no build, no ledger write, no retention changes.');
  process.exit(0);
}

// ── Build ──────────────────────────────────────

mkdirSync(STORE_DIR, { recursive: true });
// Debug builds bundle nothing: JS is served by Metro at runtime, so no
// EXPO_PUBLIC_* env is baked here (Metro inlines those at serve time).

let product; // path to the .app (ios) or .apk (android)

if (platform === 'ios-sim' || platform === 'ios-device') {
  const dest = platform === 'ios-sim' ? 'generic/platform=iOS Simulator' : 'generic/platform=iOS';
  const cfg = platform === 'ios-sim' ? [] : ['-allowProvisioningUpdates'];
  console.log('\nBuilding (xcodebuild Debug, this takes a while)…');
  run(
    [
      'xcodebuild',
      '-workspace ios/LanguagePlayer3.xcworkspace',
      '-scheme LanguagePlayer3',
      '-configuration Debug',
      `-destination '${dest}'`,
      '-derivedDataPath build/devbuild',
      ...cfg,
      'build -jobs 4',
    ].join(' '),
    { cwd: MOBILE },
  );
  const sdk = platform === 'ios-sim' ? 'Debug-iphonesimulator' : 'Debug-iphoneos';
  product = join(MOBILE, `build/devbuild/Build/Products/${sdk}/LanguagePlayer3.app`);
  if (!existsSync(product)) fail(`Build finished but product missing: ${product}`);
  if (platform === 'ios-device') {
    // RN writes ip.txt (Metro host) into the bundle for device Debug builds
    // — verify it landed so the app can find Metro on the LAN.
    const ipFile = join(product, 'ip.txt');
    if (existsSync(ipFile)) {
      const ip = readFileSync(ipFile, 'utf8').trim();
      console.log(`  ip.txt    : ${ip}`);
    } else {
      console.warn('  ⚠ ip.txt missing — the app may not reach Metro on the device (SKIP_BUNDLING_METRO_IP?); expected at runtime via react-native-xcode.sh.');
    }
  }
} else {
  console.log('\nBuilding (assembleDebug, this takes a while)…');
  run('./gradlew assembleDebug --console=plain', { cwd: join(MOBILE, 'android') });
  product = join(MOBILE, 'android/app/build/outputs/apk/debug/app-debug.apk');
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
