#!/usr/bin/env node
/**
 * Verify a dev build against its unified ledger row AND the artifact itself —
 * the "know for sure which commit this build mirrors" gate (SPEC-076 § 4.8).
 *
 * Usage:
 *   node scripts/verify-dev-build.mjs <N|latest> [--artifact <path>]
 *
 * "Dev build" = Debug build (Metro-connected): JS is served by Metro at
 * runtime, so the artifact is the compiled native shell. Checks, in order:
 *   1. The ledger row exists (dev tokens in docs/versioning/build-ledger.md).
 *   2. The artifact exists (in $LP_DEV_BUILD_DIR / .dev-builds/, or the
 *      --artifact override; archived builds are looked up in archive/ too).
 *   3. The artifact's SHA-256 matches the ledger token.
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
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parseLedger, parseDevCell } from './version-lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const STORE_DIR = process.env.LP_DEV_BUILD_DIR || join(ROOT, '.dev-builds');
const ARCHIVE_DIR = join(STORE_DIR, 'archive');

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

const rows = parseLedger();
const builds = rows.flatMap((row) => parseDevCell(row.dev).map((d) => ({ ...d, commit: row.commit })));
const build =
  target === 'latest'
    ? builds.filter((b) => b.status.startsWith('active')).sort((a, b) => b.n - a.n)[0]
    : builds.find((b) => b.n === Number(target));

if (!build) fail(`Dev build ${target} not found in docs/versioning/build-ledger.md.`);

const shortCommit = build.commit;
let fullCommit = shortCommit;
try {
  fullCommit = sh(`git rev-parse --verify ${shortCommit}^{commit}`);
} catch {
  // reported by the git object check below
}

console.log(`Dev build ${build.n} — ${build.kind} (${build.status})`);
console.log(`  ledger commit : ${shortCommit}${build.status.startsWith('archived') ? ' ⚠ archived' : ''}`);
console.log(`  artifact      : ${build.artifact}`);

const errors = [];

// 1+2. Artifact exists (store dir, archive/ for archived builds, or override).
const candidates = [artifactOverride, join(STORE_DIR, build.artifact), join(ARCHIVE_DIR, build.artifact)]
  .filter(Boolean);
const artifactPath = candidates.find((p) => existsSync(p));
if (!artifactPath) {
  errors.push(`artifact not found in .dev-builds/ or archive/ (${build.artifact})`);
} else {
  // 3. SHA-256 matches.
  const digest = sha256(artifactPath);
  const match = digest === build.sha;
  console.log(`  sha256        : ${digest} ${match ? '✓ matches ledger' : '✗ MISMATCH'}`);
  if (!match) errors.push('artifact SHA-256 does not match the ledger token');

  // 4a. ip.txt (Metro LAN host) — RN writes it for Debug device builds.
  // Release-config artifacts (legacy dev 1/2) never had one; they are
  // covered by the embedded-bundle grep instead.
  if (build.kind === 'Debug' && build.artifact.includes('-ios-device-')) {
    try {
      const listing = sh(`unzip -l '${artifactPath}'`);
      const ipMatch = listing.match(/[^\s]+ip\.txt/);
      if (ipMatch) {
        const ip = sh(`unzip -p '${artifactPath}' '${ipMatch[0]}'`).trim();
        const looksValid = /^\d{1,3}(\.\d{1,3}){3}$/.test(ip);
        console.log(`  ip.txt        : ${looksValid ? `✓ ${ip}` : `✗ '${ip}' is not an IP`}`);
        if (!looksValid) errors.push('ip.txt in the artifact does not contain a valid Metro host IP');
      } else {
        console.log('  ip.txt        : ⚠ absent (Debug device build should contain it)');
        errors.push('ip.txt missing — the app cannot find Metro on the LAN');
      }
    } catch (e) {
      errors.push(`could not inspect ip.txt: ${e.message}`);
    }
  }

  // 4b. Commit SHA embedded in the JS bundle — only when the artifact
  // contains one (Release-config artifacts). Debug builds serve JS from
  // Metro at runtime, so there is nothing to grep. Streamed through the
  // shell (unzip -p | grep) so a megabyte bundle never fills the pipe
  // buffer (ENOBUFS) — only the tiny match count is captured.
  try {
    const listing = sh(`unzip -l '${artifactPath}'`);
    const bundleMatch = listing.match(/[^\s]+main\.jsbundle/) || listing.match(/[^\s]+index\.android\.bundle/);
    if (bundleMatch) {
      const count = Number(sh(`unzip -p '${artifactPath}' '${bundleMatch[0]}' | grep -ao '${fullCommit}' | wc -l`));
      const embedded = count > 0;
      console.log(`  embedded sha  : ${embedded ? `✓ found in bundle (${count}×)` : '✗ NOT in bundle'}`);
      if (!embedded) errors.push(`commit ${fullCommit} not found in the artifact's JS bundle`);
    } else {
      console.log('  embedded sha  : — (Debug build: JS is served by Metro at runtime; no bundle to grep)');
    }
  } catch (e) {
    errors.push(`could not inspect artifact: ${e.message}`);
  }
}

// 5. Commit exists in git.
try {
  const info = sh(`git log -1 --oneline ${shortCommit}`);
  console.log(`  git object    : ✓ ${info}`);
} catch {
  errors.push(`commit ${shortCommit} does not exist in this repository`);
}

console.log('');
if (errors.length > 0) {
  for (const e of errors) console.error(`✖ ${e}`);
  fail(`Verification FAILED for dev build ${build.n}.`);
}
console.log(`✓ Dev build ${build.n} verified — artifact mirrors ${shortCommit}.`);
