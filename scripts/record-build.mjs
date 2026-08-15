#!/usr/bin/env node
/**
 * Record a consumed store build number in the SPEC-076 ledger.
 *
 * Usage:
 *   node scripts/record-build.mjs <N> <ios|android> <track> <version> [date]
 *     [--status <status>] [--dry-run]
 *
 * Examples:
 *   node scripts/record-build.mjs 3 ios "App Store" 3.1.0
 *   node scripts/record-build.mjs 3 android "Internal testing" 3.1.0 --status consumed
 *   node scripts/record-build.mjs 3 ios "App Store" 3.1.0 --tag v3.1.0-b3
 *
 * Refuses duplicates for the same platform and numbers that do not exceed the
 * platform's last recorded number (numbers can never be reused or decreased).
 * When --tag is provided, the tag must already exist (create it first with
 * scripts/tag-release.mjs).
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
    'Usage: node scripts/record-build.mjs <N> <ios|android> <track> <version> [date] [--status <status>] [--dry-run]',
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

if (tagName) {
  let tagHead = null;
  try {
    tagHead = execSync(`git rev-parse --verify --quiet ${tagName}`, {
      cwd: paths.root,
      encoding: 'utf8',
    }).trim();
  } catch {
    tagHead = null;
  }
  if (!tagHead) {
    console.error(
      `Tag "${tagName}" does not exist — create it with scripts/tag-release.mjs before uploading.`,
    );
    process.exit(1);
  }
  const head = execSync('git rev-parse HEAD', {
    cwd: paths.root,
    encoding: 'utf8',
  }).trim();
  if (tagHead !== head) {
    console.warn(
      `⚠  Tag ${tagName} points to ${tagHead.slice(0, 8)}, not HEAD (${head.slice(0, 8)}).`,
    );
  }
}

const recordDate = date ?? new Date().toISOString().slice(0, 10);
const rows = parseLedger();
const platformMax = ledgerMax(rows, platform);

if (rows.some((row) => row.n === n && row.platform === platform)) {
  console.error(`Build ${n} is already recorded for ${platform} — never reuse a number.`);
  process.exit(1);
}
if (n <= platformMax) {
  console.error(
    `Build ${n} must be greater than the last ${platform} number in the ledger (${platformMax}).`,
  );
  process.exit(1);
}

const row = {
  n,
  platform,
  label: platform === 'ios' ? `iOS — ${track}` : `Android — ${track}`,
  version,
  date: recordDate,
  status,
};

if (dryRun) {
  console.log(
    `Would record: | ${row.n} | ${row.label} | ${row.version} | ${row.date} | ${row.status} |`,
  );
  process.exit(0);
}

rows.push(row);
writeLedger(rows);
console.log(
  `Recorded build ${row.n} (${row.label}, ${row.version}, ${row.date}, ${row.status}).`,
);
if (!tagName) {
  console.log(
    `Tip: tag this upload with scripts/tag-release.mjs (expected: v${version}-b${n}).`,
  );
}
