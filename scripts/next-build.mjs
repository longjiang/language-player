#!/usr/bin/env node
/**
 * Assign the next shared store build number per SPEC-076.
 *
 * Usage:
 *   node scripts/next-build.mjs [--dry-run]
 *
 * N = max(last iOS build number, last Android versionCode in the ledger) + 1.
 * Writes N into packages/shared/src/version.json (PRODUCT_BUILD_NUMBER),
 * which apps/mobile/app.config.js reads for ios.buildNumber and
 * android.versionCode, so iOS and Android always upload with the same number.
 */

import {
  readSharedBuildNumber,
  writeSharedVersionJson,
  readSharedVersion,
  parseLedger,
  ledgerMax,
  isDryRun,
} from './version-lib.mjs';

const dryRun = isDryRun(process.argv);
const rows = parseLedger();
const iosMax = ledgerMax(rows, 'ios');
const androidMax = ledgerMax(rows, 'android');
const nextN = Math.max(iosMax, androidMax) + 1;

const currentBuild = readSharedBuildNumber();

if (currentBuild === nextN) {
  console.log(
    `PRODUCT_BUILD_NUMBER already set to ${nextN} (ledger max — iOS: ${iosMax}, Android: ${androidMax}); nothing to do.`,
  );
  process.exit(0);
}

if (dryRun) {
  console.log(
    `Next shared build number: ${nextN} (ledger max — iOS: ${iosMax}, Android: ${androidMax})`,
  );
  process.exit(0);
}

writeSharedVersionJson(readSharedVersion(), nextN);

console.log(
  `PRODUCT_BUILD_NUMBER set to ${nextN} (app.config.js will use it for ios.buildNumber and android.versionCode)`,
);
console.log(
  'Then: run scripts/verify-version.mjs after expo prebuild, and scripts/record-build.mjs after the upload.',
);
