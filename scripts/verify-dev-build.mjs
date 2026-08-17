#!/usr/bin/env node
/**
 * Verify a dev build against its ledger row AND the artifact itself —
 * the "know for sure which commit this build mirrors" gate (SPEC-076 § 4.8).
 *
 * Usage:
 *   node scripts/verify-dev-build.mjs <N|latest> [--artifact <path>]
 *
 * "Dev build" = Debug build (Metro-connected): JS is served by Metro at
 * runtime, so the artifact is the compiled native shell. Checks, in order:
 *   1. The ledger row exists.
 *   2. The artifact exists (in $LP_DEV_BUILD_DIR / ~/Desktop/LP-DevBuilds/,
 *      or the --artifact override).
 *   3. The artifact's SHA-256 matches the ledger row.
 *   4. For ios-device Debug zips: ip.txt (Metro LAN host) is present and a
 *      valid IP. For Release-config artifacts that still contain a JS
 *      bundle, the recorded commit is grepped out of it.
 *   5. The recorded commit exists in this git repository.
 *
 * Exits non-zero on any failure. Nothing here trusts the ledger alone:
 * the artifact is hashed and inspected independently.
 */

import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const LEDGER = join(ROOT, 'docs/versioning/dev-build-ledger.md');
const STORE_DIR = process.env.LP_DEV_BUILD_DIR || join(homedir(), 'Desktop/LP-DevBuilds');
const ROW_RE = /^\|\s*(\d+)\s*\|/;

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function sh(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

const args = process.argv.slice(2);
const target = args.find((a) => /^(latest|\d+)$/.test(a));
if (!target) fail('Usage: node scripts/verify-dev-build.mjs <N|latest> [--artifact <path>]');
const artifactOverride = (() => {
  const i = args.indexOf('--artifact');
  return i >= 0 ? args[i + 1] : null;
})();

if (!existsSync(LEDGER)) fail(`No ledger at ${LEDGER} — nothing to verify.`);

const rows = readFileSync(LEDGER, 'utf8')
  .split('\n')
  .filter((l) => ROW_RE.test(l))
  .map((line) => {
    const c = line.split('|').map((x) => x.trim());
    return {
      n: Number(c[1]),
      platform: c[2],
      commit: c[3],
      describe: c[4],
      date: c[5],
      artifact: c[6],
      sha256: c[7],
      status: c[8],
    };
  });

const row =
  target === 'latest'
    ? rows.filter((r) => r.status.startsWith('active')).sort((a, b) => b.n - a.n)[0]
    : rows.find((r) => r.n === Number(target));

if (!row) fail(`Ledger row ${target} not found.`);
if (row.status.startsWith('archived')) {
  console.warn(`⚠  Row ${row.n} is archived — artifact lives in ${join(STORE_DIR, 'archive', row.artifact)}`);
}

console.log(`Dev build ${row.n} — ${row.platform} (${row.date})`);
console.log(`  ledger commit : ${row.commit} (${row.describe})`);
console.log(`  artifact      : ${row.artifact}`);

const errors = [];

// 1+2. Artifact exists.
const artifactPath = artifactOverride || join(STORE_DIR, row.artifact);
if (!existsSync(artifactPath)) {
  errors.push(`artifact not found at ${artifactPath}`);
} else {
  // 3. SHA-256 matches.
  const digest = sha256(artifactPath);
  const match = digest === row.sha256;
  console.log(`  sha256        : ${digest} ${match ? '✓ matches ledger' : '✗ MISMATCH'}`);
  if (!match) errors.push('artifact SHA-256 does not match the ledger row');

  // 4. ip.txt (Metro LAN host) is written by RN for device Debug builds —
  // checked independently of the bundle (Debug builds have no bundle).
  if (row.platform === 'ios-device') {
    try {
      const listing = sh(`unzip -l '${artifactPath}'`);
      const ipMatch = listing.match(/[^\s]+ip\.txt/);
      if (ipMatch) {
        const ip = sh(`unzip -p '${artifactPath}' '${ipMatch[0]}'`).trim();
        const looksValid = /^\d{1,3}(\.\d{1,3}){3}$/.test(ip);
        console.log(`  ip.txt        : ${looksValid ? `✓ ${ip}` : `✗ '${ip}' is not an IP`}`);
        if (!looksValid) errors.push(`ip.txt in the artifact does not contain a valid Metro host IP`);
      } else {
        console.log('  ip.txt        : ⚠ absent (Debug device build should contain it)');
        errors.push('ip.txt missing — the app cannot find Metro on the LAN');
      }
    } catch (e) {
      errors.push(`could not inspect ip.txt: ${e.message}`);
    }
  }

  // 5. Commit SHA embedded in the JS bundle — only when the artifact actually
  // contains one (Release-config artifacts). Debug builds serve JS from
  // Metro at runtime, so there is nothing to grep. Streamed through the
  // shell (unzip -p | grep) so a megabyte bundle never fills the pipe
  // buffer (ENOBUFS) — only the tiny match count is captured.
  try {
    let bundlePath = null;
    if (row.platform === 'android') {
      const listing = sh(`unzip -l '${artifactPath}'`);
      if (listing.includes('assets/index.android.bundle')) bundlePath = 'assets/index.android.bundle';
    } else {
      const listing = sh(`unzip -l '${artifactPath}'`);
      const m = listing.match(/[^\s]+main\.jsbundle/);
      bundlePath = m ? m[0] : null;
    }
    if (bundlePath) {
      const count = Number(
        sh(`unzip -p '${artifactPath}' '${bundlePath}' | grep -ao '${row.commit}' | wc -l`),
      );
      const embedded = count > 0;
      console.log(`  embedded sha  : ${embedded ? `✓ found in bundle (${count}×)` : '✗ NOT in bundle'}`);
      if (!embedded) errors.push(`commit ${row.commit} not found in the artifact's JS bundle`);
    } else {
      console.log('  embedded sha  : — (Debug build: JS is served by Metro at runtime; no bundle to grep)');
    }
  } catch (e) {
    errors.push(`could not inspect artifact: ${e.message}`);
  }
}

// 5. Commit exists in git.
try {
  const info = sh(`git log -1 --oneline ${row.commit}`);
  console.log(`  git object    : ✓ ${info}`);
} catch {
  errors.push(`commit ${row.commit} does not exist in this repository`);
}

console.log('');
if (errors.length > 0) {
  for (const e of errors) console.error(`✖ ${e}`);
  fail(`Verification FAILED for dev build ${row.n}.`);
}
console.log(`✓ Dev build ${row.n} verified — artifact mirrors ${row.commit} (${row.describe}).`);
