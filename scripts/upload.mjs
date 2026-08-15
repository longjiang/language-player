#!/usr/bin/env node
/**
 * Browserless store uploads without EAS (SPEC-076).
 *
 * iOS:
 *   node scripts/upload.mjs ios <path-to.ipa> [--dry-run] [--verbose]
 *   Uses Apple's official Transporter CLI (xcrun iTMSTransporter) with the
 *   2026+ -assetFile flag. Requires:
 *     LP_APPLE_ID                  Apple ID email
 *     LP_APPLE_APP_SPECIFIC_PASS   app-specific password (not the account
 *                                  password; generate at appleid.apple.com)
 *   Optional: LP_APPLE_ITC_PROVIDER (or --itc-provider <short>) when the
 *   Apple ID belongs to more than one App Store Connect provider.
 *
 * Android:
 *   node scripts/upload.mjs android <path-to.aab>
 *     [--track internal|closed|open|production] [--status draft|inProgress|completed]
 *     [--no-commit] [--dry-run]
 *   Uses the official Google Play Developer API v3 with a service account.
 *   Requires:
 *     LP_PLAY_SERVICE_ACCOUNT_JSON  path to the Play service-account JSON
 *     LP_PLAY_PACKAGE               default ca.zerotohero.go
 *
 * App Store Connect metadata + submission (no EAS needed):
 *   node scripts/upload.mjs appstore status
 *   node scripts/upload.mjs appstore prepare <version> [--whats-new <text>]
 *   node scripts/upload.mjs appstore submit <version> [--whats-new <text>]
 *   Requires (scripts/.env.upload, gitignored):
 *     LP_ASC_KEY_PATH  .p8 private key  LP_ASC_KEY_ID  LP_ASC_ISSUER_ID
 *     Optional: LP_ASC_APP_ID (default 6520385296), LP_ASC_DEMO_EMAIL/PASS,
 *     LP_ASC_CONTACT_EMAIL
 *
 * Credentials come from the environment. A gitignored scripts/.env.upload is
 * also loaded automatically (copy scripts/.env.upload.example); real
 * environment variables always take precedence.
 */

import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { createPrivateKey, createSign } from 'crypto';
import { SignJWT } from 'jose';
import {
  paths,
  readSharedVersion,
  readSharedBuildNumber,
} from './version-lib.mjs';

const [command, artifact] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

// Optional gitignored credential file (see scripts/.env.upload.example).
// Real environment variables always win over values in this file.
const uploadEnvFile = resolve(paths.root, 'scripts/.env.upload');
if (existsSync(uploadEnvFile)) {
  for (const line of readFileSync(uploadEnvFile, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] === undefined) {
      process.env[key] = trimmed.slice(eq + 1).trim();
    }
  }
}

function fail(message) {
  console.error(`✖  ${message}`);
  process.exit(1);
}

function flagValue(name, fallback = null) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

function base64Url(input) {
  return Buffer.from(input).toString('base64url');
}

async function playApi(pathname, token, options = {}, body = null, upload = false) {
  const base = upload
    ? 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/'
    : 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/';
  const response = await fetch(
    `${base}${pathname}`,
    {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': options.contentType ?? 'application/json' } : {}),
      },
      body,
    },
  );
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (!response.ok) {
    const message = json?.error?.message ?? text.slice(0, 300);
    fail(`Play API ${response.status}: ${message}`);
  }
  return json;
}

const ASC_BASE = 'https://api.appstoreconnect.apple.com';

function positionals() {
  const out = [];
  const valueFlags = new Set([
    '--track', '--status', '--itc-provider', '--whats-new', '--build', '--version',
  ]);
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i];
    if (valueFlags.has(arg)) {
      i++; // skip the flag's value
      continue;
    }
    if (arg.startsWith('--')) continue;
    out.push(arg);
  }
  return out;
}

async function ascToken() {
  const keyPath = process.env.LP_ASC_KEY_PATH;
  const keyId = process.env.LP_ASC_KEY_ID;
  const issuer = process.env.LP_ASC_ISSUER_ID;
  if (!keyPath || !existsSync(keyPath) || !keyId || !issuer) {
    fail('Set LP_ASC_KEY_PATH, LP_ASC_KEY_ID and LP_ASC_ISSUER_ID in scripts/.env.upload (gitignored).');
  }
  const key = createPrivateKey(readFileSync(keyPath));
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(issuer)
    .setAudience('appstoreconnect-v1')
    .setIssuedAt()
    .setExpirationTime('20m')
    .sign(key);
}

async function ascApi(token, method, path, body = null) {
  const response = await fetch(`${ASC_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (!response.ok) {
    const detail =
      json?.errors?.map((e) => `${e.code}: ${e.detail ?? e.title}`).join('; ') ??
      text.slice(0, 300);
    fail(`App Store Connect API ${response.status}: ${detail}`);
  }
  const result = json?.data ?? json;
  if (json?.included) result.included = json.included;
  return result;
}

async function fetchAscBuilds(token, appId) {
  const builds = await ascApi(
    token,
    'GET',
    `/v1/apps/${appId}/builds?fields[builds]=version,processingState,expired&limit=50`,
  );
  return builds;
}

async function ascBuildVersion(token, buildId) {
  const pre = await ascApi(
    token,
    'GET',
    `/v1/builds/${buildId}/preReleaseVersion?fields[preReleaseVersions]=version`,
  );
  return pre?.attributes?.version;
}

async function appstore() {
  const [subcommand, versionArg] = positionals().slice(1);
  const appId = process.env.LP_ASC_APP_ID ?? '6520385296';

  if (dryRun) {
    console.log(`[dry-run] appstore ${subcommand ?? ''} ${versionArg ?? ''} for app ${appId} (no API calls made).`);
    return;
  }

  const token = await ascToken();

  if (subcommand === 'status') {
    const versions = await ascApi(
      token,
      'GET',
      `/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&fields[appStoreVersions]=versionString,appStoreState&limit=50`,
    );
    const builds = await fetchAscBuilds(token, appId);
    console.log('App Store versions:');
    for (const v of versions) {
      console.log(`  ${v.attributes.versionString} — ${v.attributes.appStoreState} (${v.id})`);
    }
    console.log('Builds:');
    for (const b of builds) {
      console.log(`  build ${b.attributes.version} — ${b.attributes.processingState} (${b.id})`);
    }
    return;
  }

  if (!['prepare', 'submit'].includes(subcommand) || !versionArg) {
    fail('Usage: node scripts/upload.mjs appstore <status|prepare|submit> [version]');
  }

  // 1. Ensure the appStoreVersion exists.
  let version = await ascApi(
    token,
    'GET',
    `/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&filter[versionString]=${versionArg}&fields[appStoreVersions]=versionString,appStoreState`,
  );
  let versionId = version[0]?.id;
  if (!versionId) {
    console.log(`[appstore] Creating version ${versionArg}…`);
    version = await ascApi(token, 'POST', '/v1/appStoreVersions', {
      data: {
        type: 'appStoreVersions',
        attributes: { platform: 'IOS', versionString: versionArg },
        relationships: { app: { data: { type: 'apps', id: appId } } },
      },
    });
    versionId = version.id;
  } else {
    console.log(`[appstore] Version ${versionArg} already exists (${version[0].attributes.appStoreState}).`);
    versionId = version[0].id;
  }

  // 2. Attach the build that matches the shared build number.
  const expectedBuild = String(readSharedBuildNumber());
  const builds = await fetchAscBuilds(token, appId);
  const explicitBuildId = flagValue('--build');
  let build = null;
  if (explicitBuildId) {
    build = builds.find((b) => b.id === explicitBuildId) ?? { id: explicitBuildId };
  } else {
    const candidates = builds.filter(
      (b) => b.attributes.version === expectedBuild && b.attributes.processingState === 'VALID',
    );
    for (const candidate of candidates) {
      const marketingVersion = await ascBuildVersion(token, candidate.id);
      if (marketingVersion === versionArg) {
        build = candidate;
        break;
      }
    }
    if (!build && candidates.length === 1) {
      build = candidates[0];
    }
  }
  if (!build) {
    fail(
      `No build found for ${versionArg} (expected build ${expectedBuild}). ` +
        'Use --build <id> to attach a specific build id.',
    );
  }
  console.log(`[appstore] Attaching build ${build.attributes?.version ?? '?'} (${build.id})…`);
  await ascApi(token, 'PATCH', `/v1/appStoreVersions/${versionId}/relationships/build`, {
    data: { type: 'builds', id: build.id },
  });

  // 3. Review details (demo account, contact, notes).
  const reviewDetails = {
    contactFirstName: process.env.LP_ASC_CONTACT_FIRST ?? 'Jon',
    contactLastName: process.env.LP_ASC_CONTACT_LAST ?? 'Long',
    contactEmail: process.env.LP_ASC_CONTACT_EMAIL ?? 'jon.long@zerotohero.ca',
    demoAccountName: process.env.LP_ASC_DEMO_EMAIL ?? 'tester.mary@zerotohero.ca',
    demoAccountPassword: process.env.LP_ASC_DEMO_PASS ?? 'pc8qm8LBZeGuBno',
    demoAccountRequired: true,
    notes:
      process.env.LP_ASC_REVIEW_NOTES ??
      'Language Player 3 is a language-learning app backed by a real production API (pythonvps.zerotohero.ca). ' +
        'Sign in with the demo account (tester.mary@zerotohero.ca / pc8qm8LBZeGuBno). ' +
        'Key features: Explore videos, interactive subtitles with search, dictionary, saved words, EPUB reader. ' +
        'Sample video: https://languageplayer.io/en/zh/watch/Qgzv_LBictg',
  };
  console.log('[appstore] Setting App Review information (demo account + notes)…');
  let existingDetails = await ascApi(
    token,
    'GET',
    `/v1/appStoreVersions/${versionId}/appStoreReviewDetail`,
  );
  const existingDetailsId = Array.isArray(existingDetails)
    ? existingDetails[0]?.id
    : existingDetails?.id;
  if (existingDetailsId) {
    await ascApi(token, 'PATCH', `/v1/appStoreReviewDetails/${existingDetailsId}`, {
      data: { type: 'appStoreReviewDetails', id: existingDetailsId, attributes: reviewDetails },
    });
  } else {
    await ascApi(token, 'POST', '/v1/appStoreReviewDetails', {
      data: {
        type: 'appStoreReviewDetails',
        attributes: reviewDetails,
        relationships: {
          appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } },
        },
      },
    });
  }

  // 4. What's New (version localization).
  const whatsNew =
    flagValue('--whats-new') ??
    'Subtitle search improvements with match-line preview, smarter dictionary navigation, ' +
      'more reliable video embeds, and performance fixes.';
  const localizations = await ascApi(
    token,
    'GET',
    `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations?fields[appStoreVersionLocalizations]=locale,whatsNew`,
  );
  if (localizations?.length) {
    console.log(`[appstore] Updating What's New for ${localizations[0].attributes.locale}…`);
    await ascApi(token, 'PATCH', `/v1/appStoreVersionLocalizations/${localizations[0].id}`, {
      data: {
        type: 'appStoreVersionLocalizations',
        id: localizations[0].id,
        attributes: { whatsNew },
      },
    });
  } else {
    console.log("[appstore] Creating en-CA localization with What's New…");
    await ascApi(token, 'POST', '/v1/appStoreVersionLocalizations', {
      data: {
        type: 'appStoreVersionLocalizations',
        attributes: { locale: 'en-CA', whatsNew },
        relationships: {
          appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } },
        },
      },
    });
  }

  if (subcommand === 'submit') {
    console.log('[appstore] Creating review submission…');
    const submission = await ascApi(token, 'POST', '/v1/reviewSubmissions', {
      data: {
        type: 'reviewSubmissions',
        attributes: { platform: 'IOS' },
        relationships: { app: { data: { type: 'apps', id: appId } } },
      },
    });
    console.log(`[appstore] Attaching version to review submission (${submission.id})…`);
    await ascApi(token, 'POST', '/v1/reviewSubmissionItems', {
      data: {
        type: 'reviewSubmissionItems',
        relationships: {
          reviewSubmission: { data: { type: 'reviewSubmissions', id: submission.id } },
          appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } },
        },
      },
    });
    console.log('[appstore] Submitting for review…');
    await ascApi(token, 'PATCH', `/v1/reviewSubmissions/${submission.id}`, {
      data: {
        type: 'reviewSubmissions',
        id: submission.id,
        attributes: { submitted: true },
      },
    });
    console.log('[appstore] Submitted for review. Status: Waiting for Review → In Review.');
  } else {
    console.log(`[appstore] Version ${versionArg} is prepared. Run "appstore submit ${versionArg}" to send it to App Review.`);
  }
}

async function uploadAndroid(aabPath) {
  if (!existsSync(aabPath)) {
    fail(`AAB not found: ${aabPath}`);
  }
  const pkg = process.env.LP_PLAY_PACKAGE ?? 'ca.zerotohero.go';
  const track = flagValue('--track', 'internal');
  const status = flagValue('--status', 'draft');
  const commit = !args.includes('--no-commit');
  if (!['internal', 'closed', 'open', 'production'].includes(track)) {
    fail(`Invalid track: ${track}`);
  }
  if (!['draft', 'inProgress', 'completed'].includes(status)) {
    fail(`Invalid status: ${status}`);
  }

  const version = readSharedVersion();
  const build = readSharedBuildNumber();

  if (dryRun) {
    console.log(`[dry-run] Would upload ${aabPath} to ${pkg} track=${track} status=${status} (${version} build ${build}) via Play API v3.`);
    return;
  }

  const serviceAccountPath = process.env.LP_PLAY_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountPath || !existsSync(serviceAccountPath)) {
    fail('LP_PLAY_SERVICE_ACCOUNT_JSON must point to the Play service-account JSON.');
  }
  const account = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
  const tokenUri = account.token_uri ?? 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = createSign('RSA-SHA256')
    .update(`${header}.${claims}`)
    .sign(account.private_key, 'base64url');
  const assertion = `${header}.${claims}.${signature}`;

  console.log(`[upload] Authenticating service account ${account.client_email}…`);
  const tokenResponse = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const tokenJson = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenJson.access_token) {
    fail(`OAuth failed: ${tokenJson.error_description ?? tokenJson.error ?? tokenResponse.status}`);
  }
  const token = tokenJson.access_token;

  console.log('[upload] Creating edit session…');
  const edit = await playApi(`${pkg}/edits`, token, { method: 'POST' });
  const editId = edit.id;

  console.log(`[upload] Uploading ${aabPath}…`);
  const bundle = readFileSync(aabPath);
  const uploaded = await playApi(
    `${pkg}/edits/${editId}/bundles?uploadType=media`,
    token,
    { method: 'POST', contentType: 'application/octet-stream' },
    bundle,
    true,
  );
  console.log(`[upload] Uploaded bundle versionCode ${uploaded.versionCode}.`);

  console.log(`[upload] Setting track ${track} (${status})…`);
  await playApi(`${pkg}/edits/${editId}/tracks/${track}`, token, {
    method: 'PUT',
  }, JSON.stringify({
    releases: [
      {
        name: `${version} (${build})`,
        versionCodes: [uploaded.versionCode],
        status,
      },
    ],
  }));

  if (commit) {
    console.log('[upload] Committing edit…');
    await playApi(`${pkg}/edits/${editId}:commit`, token, { method: 'POST' });
    console.log('[upload] Committed. Build is now visible in the Play Console.');
  } else {
    console.log(`[upload] Edit ${editId} left open (--no-commit). Commit from Play Console or rerun without --no-commit.`);
  }
}

function uploadIos(ipaPath) {
  if (!existsSync(ipaPath)) {
    fail(`IPA not found: ${ipaPath}`);
  }

  // Verify the artifact matches the current product version + build number.
  const expectedVersion = readSharedVersion();
  const expectedBuild = String(readSharedBuildNumber());
  let plistBuffer;
  try {
    plistBuffer = execFileSync('unzip', ['-p', ipaPath, 'Payload/LanguagePlayer3.app/Info.plist'], {
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch {
    fail(`Could not read Info.plist from ${ipaPath} (is this a LanguagePlayer3 IPA?).`);
  }
  let plist = '';
  try {
    plist = execFileSync('plutil', ['-convert', 'xml1', '-o', '-', '-'], {
      input: plistBuffer,
      encoding: 'utf8',
    });
  } catch {
    fail(`Could not parse Info.plist from ${ipaPath} (binary plist conversion failed).`);
  }
  const version = plist.match(/CFBundleShortVersionString<\/key>\s*<string>([^<]+)</)?.[1];
  const build = plist.match(/CFBundleVersion<\/key>\s*<string>([^<]+)</)?.[1];
  if (version !== expectedVersion || build !== expectedBuild) {
    fail(
      `IPA version mismatch: artifact is ${version} (${build}), expected ${expectedVersion} (${expectedBuild}).`,
    );
  }

  if (dryRun) {
    console.log(`[dry-run] IPA OK (${version} build ${build}); would upload to App Store Connect via Transporter CLI.`);
    return;
  }

  const appleId = process.env.LP_APPLE_ID;
  const password = process.env.LP_APPLE_APP_SPECIFIC_PASS;
  if (!appleId || !password) {
    fail('Set LP_APPLE_ID and LP_APPLE_APP_SPECIFIC_PASS (app-specific password) before uploading.');
  }
  console.log('[upload] Uploading to App Store Connect via Transporter…');
  const transporterArgs = [
    '-m', 'upload',
    '-assetFile', ipaPath,
    '-u', appleId,
    '-p', password,
  ];
  const itcProvider = flagValue('--itc-provider') ?? process.env.LP_APPLE_ITC_PROVIDER;
  if (itcProvider) {
    transporterArgs.push('-itc_provider', itcProvider);
  }
  if (args.includes('--verbose')) {
    transporterArgs.push('-v', 'eXtreme');
  }
  // Xcode 26 only ships a shim; prefer the full Transporter app when installed.
  const appBin = '/Applications/Transporter.app/Contents/itms/bin/iTMSTransporter';
  try {
    if (existsSync(appBin)) {
      execFileSync(appBin, transporterArgs, { stdio: 'inherit' });
    } else {
      execFileSync('xcrun', ['iTMSTransporter', ...transporterArgs], { stdio: 'inherit' });
    }
  } catch (error) {
    // Never surface the app-specific password in error output.
    const message = String(error?.message ?? error).replace(password, '********');
    fail(`Transporter upload failed: ${message}`);
  }
  console.log('[upload] Upload complete. Check App Store Connect/TestFlight for processing.');
}

if (!command || !artifact) {
  console.error(
    'Usage:\n' +
      '  node scripts/upload.mjs ios <path-to.ipa> [--dry-run]\n' +
      '  node scripts/upload.mjs android <path-to.aab> [--track <track>] [--status <status>] [--no-commit] [--dry-run]\n' +
      '  node scripts/upload.mjs appstore <status|prepare|submit> [version] [--whats-new <text>]',
  );
  process.exit(1);
}

const resolvedArtifact = resolve(paths.root, artifact);
if (command === 'ios') {
  uploadIos(resolvedArtifact);
} else if (command === 'android') {
  await uploadAndroid(resolvedArtifact);
} else if (command === 'appstore') {
  await appstore();
} else {
  fail(`Unknown command: ${command}`);
}
