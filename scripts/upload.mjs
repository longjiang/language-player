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
 *   node scripts/upload.mjs android promote <versionCode>
 *     [--track production] [--status inProgress|completed|halted|draft]
 *     [--user-fraction 0.1] [--no-commit] [--dry-run]
 *   node scripts/upload.mjs android listing-image <path-to-image>
 *     [--type featureGraphic|icon|phoneScreenshots|tenInchScreenshots|...]
 *     [--language en-US] [--no-commit] [--dry-run]
 *   node scripts/upload.mjs android listing-status [--type <type>] [--language en-US]
 *   Uses the official Google Play Developer API v3 with a service account.
 *   Requires:
 *     LP_PLAY_SERVICE_ACCOUNT_JSON  path to the Play service-account JSON
 *     LP_PLAY_PACKAGE               default ca.zerotohero.go
 *
 * App Store Connect metadata + submission (no EAS needed):
 *   node scripts/upload.mjs appstore status
 *   node scripts/upload.mjs appstore prepare <version> [--whats-new <text>]
 *   node scripts/upload.mjs appstore submit <version> [--whats-new <text>]
 *   node scripts/upload.mjs appstore metadata <version>
 *     [--description <text>] [--promo-text <text>] [--keywords <text>] [--whats-new <text>]
 *   Requires (scripts/.env.upload, gitignored):
 *     LP_ASC_KEY_PATH  .p8 private key  LP_ASC_KEY_ID  LP_ASC_ISSUER_ID
 *     Optional: LP_ASC_APP_ID (default 6520385296), LP_ASC_DEMO_EMAIL/PASS,
 *     LP_ASC_CONTACT_EMAIL
 *
 * Chrome Web Store (no browser needed):
 *   node scripts/upload.mjs chrome status
 *   node scripts/upload.mjs chrome <path-to.zip> [--publish] [--dry-run]
 *   Uses the official Chrome Web Store API v2 with a service account whose
 *   email is linked under Developer Dashboard → Settings → Service account.
 *   Requires (scripts/.env.upload, gitignored):
 *     LP_CWS_SERVICE_ACCOUNT_JSON  (defaults to LP_PLAY_SERVICE_ACCOUNT_JSON)
 *     Optional: LP_CWS_PUBLISHER_ID (default 650ad6b1-a9d4-43b6-9ff5-a8ae11ada6ad),
 *     LP_CWS_ITEM_ID (default cbkhenammkocfidciagbbibkleoenbej)
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

async function playToken() {
  const serviceAccountPath = process.env.LP_PLAY_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountPath || !existsSync(serviceAccountPath)) {
    fail('LP_PLAY_SERVICE_ACCOUNT_JSON must point to the Play service-account JSON.');
  }
  const token = await serviceAccountToken(
    serviceAccountPath,
    'https://www.googleapis.com/auth/androidpublisher',
  );
  return { token, account: JSON.parse(readFileSync(serviceAccountPath, 'utf8')) };
}

async function serviceAccountToken(serviceAccountPath, scope) {
  if (!serviceAccountPath || !existsSync(serviceAccountPath)) {
    fail(`Service account JSON not found: ${serviceAccountPath}`);
  }
  const account = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
  const tokenUri = account.token_uri ?? 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope,
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = createSign('RSA-SHA256')
    .update(`${header}.${claims}`)
    .sign(account.private_key, 'base64url');
  const assertion = `${header}.${claims}.${signature}`;

  console.log(`[upload] Authenticating service account ${account.client_email} (${scope})…`);
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
  return tokenJson.access_token;
}

const ASC_BASE = 'https://api.appstoreconnect.apple.com';

// ── Chrome Web Store (API v2, service account) ────────────────────────────

const CWS_SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const CWS_BASE = 'https://chromewebstore.googleapis.com';

function cwsName() {
  const publisherId = process.env.LP_CWS_PUBLISHER_ID ?? '650ad6b1-a9d4-43b6-9ff5-a8ae11ada6ad';
  const itemId = process.env.LP_CWS_ITEM_ID ?? 'cbkhenammkocfidciagbbibkleoenbej';
  return { name: `publishers/${publisherId}/items/${itemId}`, itemId };
}

async function cwsApi(name, pathname, token, options = {}, body = null, upload = false) {
  const base = upload ? `${CWS_BASE}/upload` : CWS_BASE;
  const response = await fetch(`${base}/v2/${pathname}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': options.contentType ?? 'application/json' } : {}),
    },
    body,
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (!response.ok) {
    const message = json?.error?.message ?? text.slice(0, 300);
    fail(`Chrome Web Store API ${response.status}: ${message}`);
  }
  return json;
}

async function cwsToken() {
  const serviceAccountPath =
    process.env.LP_CWS_SERVICE_ACCOUNT_JSON ?? process.env.LP_PLAY_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountPath || !existsSync(serviceAccountPath)) {
    fail(
      'Set LP_CWS_SERVICE_ACCOUNT_JSON (or LP_PLAY_SERVICE_ACCOUNT_JSON) to a service account ' +
        'linked in the Chrome Web Store Developer Dashboard (Settings → Service account).',
    );
  }
  return serviceAccountToken(serviceAccountPath, CWS_SCOPE);
}

async function chromeStatus() {
  const { name } = cwsName();
  if (dryRun) {
    console.log(`[dry-run] Would fetch status for ${name} (no API calls made).`);
    return;
  }
  const token = await cwsToken();
  const status = await cwsApi(name, `${name}:fetchStatus`, token, { method: 'GET' });
  console.log(`[chrome] ${status.name ?? name}`);
  if (status.itemId) console.log(`  itemId: ${status.itemId}`);
  if (status.publishedItemRevisionStatus) {
    console.log(`  published: ${status.publishedItemRevisionStatus.state}`);
  }
  if (status.submittedItemRevisionStatus) {
    console.log(`  submitted: ${status.submittedItemRevisionStatus.state}`);
  }
  if (status.lastAsyncUploadState) console.log(`  lastAsyncUploadState: ${status.lastAsyncUploadState}`);
  if (status.warned) console.log('  ⚠ warned: true (policy warning — check dashboard)');
  if (status.takenDown) console.log('  ⛔ takenDown: true');
}

async function chromeUpload(zipPath) {
  if (!existsSync(zipPath)) fail(`ZIP not found: ${zipPath}`);
  const { name, itemId } = cwsName();
  const publish = args.includes('--publish');

  if (dryRun) {
    console.log(
      `[dry-run] Would upload ${zipPath} to ${name}${publish ? ' and publish' : ''} (no API calls made).`,
    );
    return;
  }

  const token = await cwsToken();
  console.log(`[chrome] Uploading ${zipPath} to ${name}…`);
  const uploaded = await cwsApi(
    name,
    `${name}:upload`,
    token,
    { method: 'POST', contentType: 'application/zip' },
    readFileSync(zipPath),
    true,
  );
  console.log(
    `[chrome] Upload ${uploaded.uploadState ?? 'complete'} — crxVersion ${uploaded.crxVersion ?? 'unknown'} (item ${uploaded.itemId ?? itemId}).`,
  );

  if (uploaded.uploadState === 'UPLOAD_IN_PROGRESS') {
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const status = await cwsApi(name, `${name}:fetchStatus`, token, { method: 'GET' });
      console.log(`[chrome] Poll ${i + 1}: lastAsyncUploadState=${status.lastAsyncUploadState ?? 'n/a'}`);
      if (status.lastAsyncUploadState && status.lastAsyncUploadState !== 'UPLOAD_IN_PROGRESS') break;
    }
  }

  if (publish) {
    console.log('[chrome] Publishing / submitting for review…');
    const result = await cwsApi(
      name,
      `${name}:publish`,
      token,
      { method: 'POST' },
      JSON.stringify({ publishType: 'DEFAULT_PUBLISH' }),
    );
    console.log(`[chrome] Publish result: state=${result.state} item=${result.itemId ?? result.name ?? ''}`);
    const warnings = result.warningInfo?.warnings ?? [];
    if (warnings.length) {
      for (const warning of warnings) {
        console.log(`  ⚠ ${warning.reason}: ${warning.description}`);
      }
    } else {
      console.log('[chrome] No warnings.');
    }
  } else {
    console.log('[chrome] Uploaded (not published). Re-run with --publish to submit for review.');
  }
}

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

async function updateLocalization(token, versionId, attributes) {
  const localizations = await ascApi(
    token,
    'GET',
    `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations?fields[appStoreVersionLocalizations]=locale,description,keywords,promotionalText,whatsNew`,
  );
  if (localizations?.length) {
    const locale = localizations[0].attributes.locale;
    console.log(`[appstore] Updating ${locale} localization…`);
    await ascApi(token, 'PATCH', `/v1/appStoreVersionLocalizations/${localizations[0].id}`, {
      data: {
        type: 'appStoreVersionLocalizations',
        id: localizations[0].id,
        attributes,
      },
    });
  } else {
    console.log("[appstore] Creating en-CA localization…");
    await ascApi(token, 'POST', '/v1/appStoreVersionLocalizations', {
      data: {
        type: 'appStoreVersionLocalizations',
        attributes: { locale: 'en-CA', ...attributes },
        relationships: {
          appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } },
        },
      },
    });
  }
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

  if (!['prepare', 'submit', 'metadata'].includes(subcommand) || !versionArg) {
    fail('Usage: node scripts/upload.mjs appstore <status|prepare|submit|metadata> [version]');
  }

  if (subcommand === 'metadata') {
    const version = await ascApi(
      token,
      'GET',
      `/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&filter[versionString]=${versionArg}&fields[appStoreVersions]=versionString`,
    );
    const versionId = version[0]?.id;
    if (!versionId) {
      fail(`No App Store version ${versionArg} found.`);
    }
    const attributes = {};
    for (const [flag, key] of [
      ['--description', 'description'],
      ['--promo-text', 'promotionalText'],
      ['--keywords', 'keywords'],
      ['--whats-new', 'whatsNew'],
    ]) {
      const value = flagValue(flag);
      if (value) attributes[key] = value;
    }
    if (!Object.keys(attributes).length) {
      fail('Provide at least one of --description, --promo-text, --keywords, --whats-new.');
    }
    await updateLocalization(token, versionId, attributes);
    console.log('[appstore] Metadata updated.');
    return;
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
  await updateLocalization(token, versionId, { whatsNew });

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

  const { token, account } = await playToken();

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

async function promoteAndroid() {
  const pkg = process.env.LP_PLAY_PACKAGE ?? 'ca.zerotohero.go';
  const track = flagValue('--track', 'production');
  const versionCodeRaw = positionals()[2];
  const commit = !args.includes('--no-commit');
  if (!versionCodeRaw || !/^\d+$/.test(versionCodeRaw)) {
    fail('Usage: node scripts/upload.mjs android promote <versionCode> [--track production] [--status inProgress|completed|halted|draft] [--user-fraction 0.1]');
  }
  const versionCode = Number(versionCodeRaw);
  const userFractionRaw = flagValue('--user-fraction');
  let userFraction = null;
  if (userFractionRaw) {
    userFraction = Number(userFractionRaw);
    if (!(userFraction > 0 && userFraction < 1)) {
      fail('--user-fraction must be greater than 0 and less than 1.');
    }
  }
  const status = flagValue('--status', userFraction ? 'inProgress' : 'completed');
  if (!['draft', 'inProgress', 'completed', 'halted'].includes(status)) {
    fail(`Invalid status: ${status}`);
  }
  if (userFraction && !['inProgress', 'halted'].includes(status)) {
    fail('--user-fraction requires --status inProgress or halted.');
  }

  const version = readSharedVersion();
  const build = readSharedBuildNumber();

  if (dryRun) {
    console.log(
      `[dry-run] Would promote versionCode ${versionCode} on ${pkg} to track=${track} status=${status}` +
        (userFraction ? ` userFraction=${userFraction}` : '') +
        ` (${version} build ${build}).`,
    );
    return;
  }

  const { token, account } = await playToken();
  console.log('[upload] Creating edit session…');
  const edit = await playApi(`${pkg}/edits`, token, { method: 'POST' });
  const editId = edit.id;

  const release = {
    name: `${version} (${build})`,
    versionCodes: [versionCode],
    status,
  };
  if (userFraction) release.userFraction = userFraction;

  console.log(`[upload] Setting track ${track} (${status}${userFraction ? `, ${Math.round(userFraction * 100)}%` : ''})…`);
  await playApi(`${pkg}/edits/${editId}/tracks/${track}`, token, {
    method: 'PUT',
  }, JSON.stringify({ releases: [release] }));

  if (commit) {
    console.log('[upload] Committing edit…');
    await playApi(`${pkg}/edits/${editId}:commit`, token, { method: 'POST' });
    console.log(`[upload] Committed. versionCode ${versionCode} is now on the ${track} track.`);
  } else {
    console.log(`[upload] Edit ${editId} left open (--no-commit). Commit from Play Console or rerun without --no-commit.`);
  }
}

async function listingImageAndroid() {
  const imagePath = positionals()[2];
  if (!imagePath || !existsSync(imagePath)) {
    fail('Usage: node scripts/upload.mjs android listing-image <path-to-image> [--type featureGraphic] [--language en-US]');
  }
  const pkg = process.env.LP_PLAY_PACKAGE ?? 'ca.zerotohero.go';
  const imageType = flagValue('--type', 'featureGraphic');
  const language = flagValue('--language', 'en-US');
  const commit = !args.includes('--no-commit');
  const validTypes = [
    'featureGraphic', 'icon', 'phoneScreenshots', 'promoGraphic',
    'sevenInchScreenshots', 'tenInchScreenshots', 'tvBanner',
    'tvScreenshots', 'wearScreenshots',
  ];
  if (!validTypes.includes(imageType)) {
    fail(`Invalid image type: ${imageType} (expected one of: ${validTypes.join(', ')}).`);
  }

  if (imageType === 'featureGraphic') {
    let width = null;
    let height = null;
    try {
      const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', imagePath], {
        encoding: 'utf8',
      });
      width = Number(out.match(/pixelWidth:\s*(\d+)/)?.[1]);
      height = Number(out.match(/pixelHeight:\s*(\d+)/)?.[1]);
    } catch {
      // sips unavailable; Google validates dimensions on upload.
    }
    if (width && height && (width !== 1024 || height !== 500)) {
      fail(`Feature graphic must be 1024x500, got ${width}x${height}.`);
    }
  }

  if (dryRun) {
    console.log(`[dry-run] Would upload ${imagePath} to ${pkg} listing ${language}/${imageType}.`);
    return;
  }

  const { token, account } = await playToken();
  console.log('[upload] Creating edit session…');
  const edit = await playApi(`${pkg}/edits`, token, { method: 'POST' });
  const editId = edit.id;

  console.log(`[upload] Uploading ${imageType} (${language})…`);
  const uploaded = await playApi(
    `${pkg}/edits/${editId}/listings/${language}/${imageType}?uploadType=media`,
    token,
    { method: 'POST', contentType: 'image/png' },
    readFileSync(imagePath),
    true,
  );
  console.log(`[upload] Uploaded listing image ${uploaded.id ?? ''} (${uploaded.imageUrl ?? 'no URL returned'}).`);

  if (commit) {
    console.log('[upload] Committing edit…');
    await playApi(`${pkg}/edits/${editId}:commit`, token, { method: 'POST' });
    console.log('[upload] Committed. The image is now live on the Play listing.');
  } else {
    console.log(`[upload] Edit ${editId} left open (--no-commit). Commit from Play Console or rerun without --no-commit.`);
  }
}

async function listingStatusAndroid() {
  const pkg = process.env.LP_PLAY_PACKAGE ?? 'ca.zerotohero.go';
  const imageType = flagValue('--type', 'featureGraphic');
  const language = flagValue('--language', 'en-US');

  if (dryRun) {
    console.log(`[dry-run] Would read ${pkg} listing ${language}/${imageType}.`);
    return;
  }

  const { token, account } = await playToken();
  const edit = await playApi(`${pkg}/edits`, token, { method: 'POST' });
  const images = await playApi(
    `${pkg}/edits/${edit.id}/listings/${language}/${imageType}`,
    token,
  );
  console.log(`${imageType} (${language}): ${(images.images ?? []).length} image(s)`);
  for (const img of images.images ?? []) {
    console.log(`  ${img.imageUrl ?? img.url ?? img.id ?? JSON.stringify(img).slice(0, 120)}`);
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
      '  node scripts/upload.mjs android promote <versionCode> [--track production] [--status <status>] [--user-fraction 0.1]\n' +
      '  node scripts/upload.mjs android listing-image <path-to-image> [--type <type>] [--language <locale>]\n' +
      '  node scripts/upload.mjs appstore <status|prepare|submit|metadata> [version] [--whats-new <text>]\n' +
      '  node scripts/upload.mjs chrome <path-to.zip|status> [--publish] [--dry-run]',
  );
  process.exit(1);
}

const resolvedArtifact = resolve(paths.root, artifact);
if (command === 'ios') {
  uploadIos(resolvedArtifact);
} else if (command === 'android') {
  if (artifact === 'promote') {
    await promoteAndroid();
  } else if (artifact === 'listing-image') {
    await listingImageAndroid();
  } else if (artifact === 'listing-status') {
    await listingStatusAndroid();
  } else {
    await uploadAndroid(resolvedArtifact);
  }
} else if (command === 'appstore') {
  await appstore();
} else if (command === 'chrome') {
  if (artifact === 'status') {
    await chromeStatus();
  } else {
    await chromeUpload(resolvedArtifact);
  }
} else {
  fail(`Unknown command: ${command}`);
}
