#!/usr/bin/env node
/**
 * Record a consumed store build number in the unified build ledger
 * (docs/versioning/build-ledger.md — one row per commit).
 *
 * Usage:
 *   node scripts/record-build.mjs <N> <ios|android> <track> <version> [date]
 *     [--status <status>] [--tag <tag>] [--dry-run]
 *
 * Examples:
 *   node scripts/record-build.mjs 5 ios "TestFlight" 3.1.2 --tag v3.1.2-b5
 *   node scripts/record-build.mjs 6 android "Internal testing" 3.2.0 --status consumed
 *
 * The entry is written into the row of the commit the --tag points at
 * (default: HEAD): `3.1.2 — iOS TestFlight (b5, consumed)`. If no row exists
 * for that commit yet, one is created.
 *
 * Refuses a number already recorded for the same platform and numbers that
 * do not exceed the platform's last recorded number (numbers can never be
 * reused or decreased). When --tag is provided, the tag must already exist
 * (create it first with scripts/tag-release.mjs).
 */

import { execSync } from 'child_process';
import {
  paths,
  parseLedger,
  writeLedger,
  ledgerMax,
  isDryRun,
} from './version-lib.mjs';

const rawArgv = process.argv.slice(2);
const args = [];
for (let i = 0; i < rawArgv.length; i++) {
  const arg = rawArgv[i];
  if (arg === '--status' || arg === '--tag') {
    i++; // skip the flag's value
    continue;
  }
  if (arg.startsWith('--')) continue;
  args.push(arg);
}
const dryRun = isDryRun(process.argv);
const statusIndex = rawArgv.indexOf('--status');
const status = statusIndex >= 0 ? rawArgv[statusIndex + 1] : 'consumed';
const tagIndex = rawArgv.indexOf('--tag');
const tagName = tagIndex >= 0 ? rawArgv[tagIndex + 1] : null;

const [nRaw, platformRaw, track, version, date] = args;
if (!nRaw || !platformRaw || !track || !version) {
  console.error(
    'Usage: node scripts/record-build.mjs <N> <ios|android> <track> <version> [date] [--status <status>] [--tag <tag>] [--dry-run]',
  );
  process.exit(1);
}

const n = Number(nRaw);
const platform = platformRaw.toLowerCase();
if (!Number.isInteger(n) || n <= 0) {
  console.error(`N must be a positive integer, got: ${nRaw}`);
  process.exit(1);
}
if (!['ios', 'android'].includes(platform)) {
  console.error(`Platform must be ios or android, got: ${platformRaw}`);
  process.exit(1);
}
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Version must be MAJOR.MINOR.PATCH, got: ${version}`);
  process.exit(1);
}

// Resolve the commit the entry belongs to (--tag → tag target, else HEAD).
let commit = null;
if (tagName) {
  try {
    commit = execSync(`git rev-parse --short=8 --verify ${tagName}^{commit}`, {
      cwd: paths.root,
      encoding: 'utf8',
    }).trim();
  } catch {
    commit = null;
  }
  if (!commit) {
    console.error(
      `Tag "${tagName}" does not exist — create it with scripts/tag-release.mjs before uploading.`,
    );
    process.exit(1);
  }
  const head = execSync('git rev-parse --short=8 HEAD', {
    cwd: paths.root,
    encoding: 'utf8',
  }).trim();
  if (commit !== head) {
    console.warn(`⚠  Tag ${tagName} points to ${commit}, not HEAD (${head}).`);
  }
} else {
  commit = execSync('git rev-parse --short=8 HEAD', {
    cwd: paths.root,
    encoding: 'utf8',
  }).trim();
}

const now = new Date();
const recordDate =
  date ??
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

const rows = parseLedger();
const platformMax = ledgerMax(rows, platform);
const existing = rows
  .flatMap((row) => row.storeEntries)
  .find((entry) => entry.b === n && entry.platform === platform);
if (existing) {
  console.error(
    `Build ${n} is already recorded for ${platform} (${existing.label}) — never reuse a number.`,
  );
  process.exit(1);
}
if (n <= platformMax) {
  console.error(
    `Build ${n} must be greater than the last ${platform} number in the ledger (${platformMax}).`,
  );
  process.exit(1);
}

const entry = `${version} — ${platform === 'ios' ? 'iOS' : 'Android'} ${track} (b${n}, ${status})`;

const row = rows.find((r) => r.commit === commit);
if (row) {
  row.store = row.store ? `${row.store} · ${entry}` : entry;
} else {
  rows.push({ idx: rows.length + 1, commit, date: recordDate, store: entry, dev: '' });
}

if (dryRun) {
  console.log(`Would record into commit ${commit}: ${entry}`);
  process.exit(0);
}

writeLedger(rows);
console.log(`Recorded build ${n} (${entry}) into commit ${commit}.`);
if (!tagName) {
  console.log(
    `Tip: tag this upload with scripts/tag-release.mjs (expected: v${version}-b${n}).`,
  );
}
