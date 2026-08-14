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
 *
 * Refuses duplicates for the same platform and numbers that do not exceed the
 * platform's last recorded number (numbers can never be reused or decreased).
 */

import {
  parseLedger,
  writeLedger,
  ledgerMax,
  isDryRun,
} from './version-lib.mjs';

const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const dryRun = isDryRun(process.argv);
const statusIndex = process.argv.indexOf('--status');
const status = statusIndex >= 0 ? process.argv[statusIndex + 1] : 'consumed';

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
