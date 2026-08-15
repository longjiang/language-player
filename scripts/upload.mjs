#!/usr/bin/env node
/**
 * Browserless store uploads without EAS (SPEC-076).
 *
 * iOS:
 *   node scripts/upload.mjs ios <path-to.ipa> [--dry-run]
 *   Uses Apple's official Transporter CLI (xcrun iTMSTransporter) with the
 *   2026+ -assetFile flag. Requires:
 *     LP_APPLE_ID                  Apple ID email
 *     LP_APPLE_APP_SPECIFIC_PASS   app-specific password (not the account
 *                                  password; generate at appleid.apple.com)
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
 * Credentials come from the environment only; nothing is stored in the repo.
 */

import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { createSign } from 'crypto';
import {
  paths,
  readSharedVersion,
  readSharedBuildNumber,
} from './version-lib.mjs';

const [command, artifact] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

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

async function playApi(pathname, token, options = {}, body = null) {
  const response = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pathname}`,
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
  execFileSync('xcrun', [
    'iTMSTransporter',
    '-m', 'upload',
    '-assetFile', ipaPath,
    '-u', appleId,
    '-p', password,
  ], { stdio: 'inherit' });
  console.log('[upload] Upload complete. Check App Store Connect/TestFlight for processing.');
}

if (!command || !artifact) {
  console.error(
    'Usage:\n' +
      '  node scripts/upload.mjs ios <path-to.ipa> [--dry-run]\n' +
      '  node scripts/upload.mjs android <path-to.aab> [--track <track>] [--status <status>] [--no-commit] [--dry-run]',
  );
  process.exit(1);
}

const resolvedArtifact = resolve(paths.root, artifact);
if (command === 'ios') {
  uploadIos(resolvedArtifact);
} else if (command === 'android') {
  await uploadAndroid(resolvedArtifact);
} else {
  fail(`Unknown command: ${command}`);
}
