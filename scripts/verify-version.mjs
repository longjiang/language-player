#!/usr/bin/env node
/**
 * Pre-upload version gate per SPEC-076.
 *
 * Usage:
 *   node scripts/verify-version.mjs
 *
 * Run after `expo prebuild` and after the archive/AAB build, before
 * uploading to either store. Exits non-zero if the version/build numbers
 * are inconsistent, below the ledger, or out of sync with the dynamic Expo
 * config or native projects.
 */

import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import {
  paths,
  readSharedVersion,
  readWebVersion,
  readMobileConfig,
  parseLedger,
  ledgerMax,
  compareVersions,
} from './version-lib.mjs';

const errors = [];
const warnings = [];

const rows = parseLedger();
const iosMax = ledgerMax(rows, 'ios');
const androidMax = ledgerMax(rows, 'android');
const shared = readSharedVersion();
const web = readWebVersion();
const mobile = readMobileConfig();

// 1. Product version consistency (web + mobile must be identical).
if (web !== shared) {
  errors.push(`apps/web/package.json (${web}) != shared PRODUCT_VERSION (${shared})`);
}
if (mobile.version !== shared) {
  errors.push(`mobile config version (${mobile.version}) != shared PRODUCT_VERSION (${shared})`);
}

// 2. Build number sanity.
const iosN = mobile.iosBuildNumber == null ? null : Number(mobile.iosBuildNumber);
const androidN =
  mobile.androidVersionCode == null ? null : Number(mobile.androidVersionCode);
if (iosN == null || !Number.isInteger(iosN) || iosN <= 0) {
  errors.push('shared ios build number is missing or invalid (PRODUCT_BUILD_NUMBER must be a positive integer).');
}
if (androidN == null || !Number.isInteger(androidN) || androidN <= 0) {
  errors.push('shared android versionCode is missing or invalid (PRODUCT_BUILD_NUMBER must be a positive integer).');
}
if (androidN != null && androidN > 2100000000) {
  errors.push(`android.versionCode (${androidN}) exceeds Google Play's 2,100,000,000 cap.`);
}

if (iosN != null && iosN < iosMax) {
  errors.push(`iOS build ${iosN} is below the ledger max (${iosMax}) — reuse/regression.`);
}
if (androidN != null && androidN < androidMax) {
  errors.push(`Android versionCode ${androidN} is below the ledger max (${androidMax}) — reuse/regression.`);
}

// 2b. The dynamic Expo config must agree with the shared source.
const requireFromMobile = createRequire(paths.mobileAppConfig);
let expoConfig = null;
if (existsSync(paths.mobileAppConfig)) {
  try {
    const loaded = requireFromMobile(paths.mobileAppConfig);
    expoConfig = loaded?.default?.expo ?? loaded?.expo ?? null;
  } catch (error) {
    errors.push(`Could not evaluate apps/mobile/app.config.js: ${error.message}`);
  }
} else {
  errors.push('apps/mobile/app.config.js is missing (SPEC-076 requires the dynamic config).');
}
if (expoConfig) {
  if (expoConfig.version !== shared) {
    errors.push(`app.config.js expo.version (${expoConfig.version}) != shared PRODUCT_VERSION (${shared})`);
  }
  if (String(expoConfig.ios?.buildNumber) !== String(iosN)) {
    errors.push(`app.config.js ios.buildNumber (${expoConfig.ios?.buildNumber}) != shared build (${iosN})`);
  }
  if (expoConfig.android?.versionCode !== androidN) {
    errors.push(`app.config.js android.versionCode (${expoConfig.android?.versionCode}) != shared build (${androidN})`);
  }
}
if (existsSync(paths.mobileAppConfig.replace('app.config.js', 'app.json'))) {
  warnings.push('apps/mobile/app.json still exists — remove it so the dynamic app.config.js is the only source.');
}

// 3. Released vs pending release state.
const pending =
  (iosN != null && iosN > iosMax) || (androidN != null && androidN > androidMax);

function readIosNative() {
  if (!existsSync(paths.iosInfoPlist)) return null;
  const text = readFileSync(paths.iosInfoPlist, 'utf8');
  const version = text.match(/CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/);
  const build = text.match(/CFBundleVersion<\/key>\s*<string>([^<]+)<\/string>/);
  return version && build ? { version: version[1], build: build[1] } : null;
}

function readAndroidNative() {
  if (!existsSync(paths.androidBuildGradle)) return null;
  const text = readFileSync(paths.androidBuildGradle, 'utf8');
  const version = text.match(/versionName\s+"([^"]+)"/);
  const code = text.match(/versionCode\s+(\d+)/);
  return version && code ? { version: version[1], code: Number(code[1]) } : null;
}

if (pending) {
  if (iosN !== androidN) {
    errors.push(
      `Release in progress but build numbers differ: ios.buildNumber=${iosN}, android.versionCode=${androidN}. They must be identical (SPEC-076).`,
    );
  }
  if (iosN != null && iosN <= iosMax) {
    errors.push(`iOS build ${iosN} does not exceed the ledger max (${iosMax}).`);
  }
  if (androidN != null && androidN <= androidMax) {
    errors.push(`Android versionCode ${androidN} does not exceed the ledger max (${androidMax}).`);
  }

  const iosNative = readIosNative();
  if (iosNative) {
    if (iosNative.version !== mobile.version || iosNative.build !== String(iosN)) {
      errors.push(
        `iOS native project is out of sync: Info.plist has ${iosNative.version} (${iosNative.build}), config expects ${mobile.version} (${iosN}). Run expo prebuild and re-verify.`,
      );
    }
  } else {
    warnings.push('iOS native project not found — run expo prebuild --platform ios and re-verify.');
  }

  const androidNative = readAndroidNative();
  if (androidNative) {
    if (
      androidNative.version !== mobile.version ||
      androidNative.code !== androidN
    ) {
      errors.push(
        `Android native project is out of sync: build.gradle has ${androidNative.version} (${androidNative.code}), config expects ${mobile.version} (${androidN}). Run expo prebuild and re-verify.`,
      );
    }
  } else {
    warnings.push('Android native project not found — run expo prebuild --platform android and re-verify.');
  }

  let lastTag = null;
  try {
    const tags = execSync('git tag -l --sort=-v:refname', {
      cwd: paths.root,
      encoding: 'utf8',
    })
      .split('\n')
      .map((tag) => tag.trim())
      .filter(Boolean);
    // Compare against plain semver tags only (vX.Y.Z or X.Y.Z); build tags
    // like v3.0.0-b3 are not release versions.
    lastTag = tags.find((tag) => /^v?\d+\.\d+\.\d+$/.test(tag)) ?? null;
  } catch {
    lastTag = null;
  }
  if (lastTag) {
    const tagVersion = lastTag.replace(/^v/, '');
    try {
      const cmp = compareVersions(shared, tagVersion);
      if (cmp < 0) {
        errors.push(`Product version ${shared} is lower than the existing release tag ${lastTag}.`);
      } else if (cmp === 0) {
        let tagHead = null;
        try {
          tagHead = execSync(`git rev-parse --verify --quiet ${lastTag}`, {
            cwd: paths.root,
            encoding: 'utf8',
          }).trim();
        } catch {
          tagHead = null;
        }
        const head = execSync('git rev-parse HEAD', {
          cwd: paths.root,
          encoding: 'utf8',
        }).trim();
        if (tagHead !== head) {
          errors.push(
            `Release tag ${lastTag} already exists at another commit — bump the product version before uploading.`,
          );
        }
      }
    } catch {
      warnings.push(`Could not parse release tag ${lastTag}; skipping tag comparison.`);
    }
  } else {
    warnings.push('No plain semver release tags (vX.Y.Z) found; skipping release-tag comparison.');
  }
} else {
  warnings.push(
    `Released state: iOS build ${iosN}, Android versionCode ${androidN} match the ledger — no release in progress.`,
  );
  if (iosN !== androidN) {
    warnings.push(
      'Historical build-number mismatch (iOS vs Android). Run scripts/next-build.mjs when preparing the next release to realign them.',
    );
  }
}

console.log('── SPEC-076 version gate ──────────────────────────────');
console.log(`Product version : ${shared} (web ${web} / mobile config ${mobile.version})`);
console.log(`iOS build       : ${iosN} (ledger max ${iosMax})`);
console.log(`Android version : ${androidN} (ledger max ${androidMax})`);
console.log(`Expected tag    : v${shared}-b${iosN} (scripts/tag-release.mjs)`);
console.log(`State           : ${pending ? 'PENDING RELEASE — strict checks' : 'released'}`);
console.log('');
for (const warning of warnings) console.log(`⚠  ${warning}`);
for (const error of errors) console.log(`✖  ${error}`);
if (errors.length > 0) {
  console.log('');
  console.log(`FAILED with ${errors.length} error(s). Do not upload.`);
  process.exit(1);
}
console.log('');
console.log('OK — version gate passed.');
