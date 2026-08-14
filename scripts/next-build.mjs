#!/usr/bin/env node
/**
 * Assign the next shared store build number per SPEC-076.
 *
 * Usage:
 *   node scripts/next-build.mjs [--dry-run]
 *
 * N = max(last iOS build number, last Android versionCode in the ledger) + 1.
 * Writes N into both apps/mobile/app.json ios.buildNumber and
 * android.versionCode so iOS and Android always upload with the same number.
 */

import {
  paths,
  readJson,
  writeJson,
  parseLedger,
  ledgerMax,
  isDryRun,
} from './version-lib.mjs';

const dryRun = isDryRun(process.argv);
const rows = parseLedger();
const iosMax = ledgerMax(rows, 'ios');
const androidMax = ledgerMax(rows, 'android');
const nextN = Math.max(iosMax, androidMax) + 1;

const app = readJson(paths.mobileAppJson);
const currentIos = app.expo?.ios?.buildNumber;
const currentAndroid = app.expo?.android?.versionCode;

if (
  currentIos != null &&
  String(currentIos) === String(nextN) &&
  currentAndroid === nextN
) {
  console.log(`app.json already prepared for build ${nextN}; nothing to do.`);
  process.exit(0);
}

if (dryRun) {
  console.log(
    `Next shared build number: ${nextN} (ledger max — iOS: ${iosMax}, Android: ${androidMax})`,
  );
  process.exit(0);
}

if (!app.expo.ios) app.expo.ios = {};
app.expo.ios.buildNumber = String(nextN);
app.expo.android.versionCode = nextN;
writeJson(paths.mobileAppJson, app);

console.log(
  `app.json set to ios.buildNumber=${nextN}, android.versionCode=${nextN}`,
);
console.log(
  'Then: run scripts/verify-version.mjs after expo prebuild, and scripts/record-build.mjs after the upload.',
);
