#!/usr/bin/env node
/**
 * Set the TestFlight build-level "What to Test" metadata
 * (betaBuildLocalizations.whatsNew) for an uploaded build per ARCH-029 §4.3.1.
 *
 * Usage:
 *   node scripts/set-testflight-whatsnew.mjs <marketingVersion> <buildNumber> --whats-new "<text>"
 *
 * Resolves the processed iOS build by app ID (default 6520385296), then
 * updates (or creates) the en-CA betaBuildLocalization. Requires
 * LP_ASC_KEY_PATH / LP_ASC_KEY_ID / LP_ASC_ISSUER_ID in scripts/.env.upload.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createPrivateKey } from 'crypto';
import { SignJWT } from 'jose';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const uploadEnvFile = resolve(root, 'scripts/.env.upload');

// Load scripts/.env.upload (real env wins).
if (existsSync(uploadEnvFile)) {
  for (const line of readFileSync(uploadEnvFile, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] === undefined) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}

function fail(message) {
  console.error(`✖  ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const statusMode = args.includes('--status');
const [version, buildRaw] = args.filter((a) => !a.startsWith('--'));
const whatsNewIndex = process.argv.indexOf('--whats-new');
let whatsNew = whatsNewIndex >= 0 ? process.argv[whatsNewIndex + 1] : null;
const whatsNewFileIndex = process.argv.indexOf('--whats-new-file');
const whatsNewFile = whatsNewFileIndex >= 0 ? process.argv[whatsNewFileIndex + 1] : null;
if (whatsNewFile) {
  whatsNew = readFileSync(resolve(root, whatsNewFile), 'utf8').trim();
}

if (!version || !buildRaw || (!whatsNew && !statusMode)) {
  fail('Usage: node scripts/set-testflight-whatsnew.mjs <version> <buildNumber> [--whats-new "<text>"] [--whats-new-file <path>] [--status]');
}

const build = Number(buildRaw);
if (!Number.isInteger(build) || build <= 0) fail(`Invalid build number: ${buildRaw}`);

const appId = process.env.LP_ASC_APP_ID ?? '6520385296';
const keyPath = process.env.LP_ASC_KEY_PATH;
const keyId = process.env.LP_ASC_KEY_ID;
const issuer = process.env.LP_ASC_ISSUER_ID;
if (!keyPath || !existsSync(keyPath) || !keyId || !issuer) {
  fail('Set LP_ASC_KEY_PATH, LP_ASC_KEY_ID and LP_ASC_ISSUER_ID in scripts/.env.upload.');
}

const key = createPrivateKey(readFileSync(keyPath));
const token = await new SignJWT({})
  .setProtectedHeader({ alg: 'ES256', kid: keyId })
  .setIssuer(issuer)
  .setAudience('appstoreconnect-v1')
  .setIssuedAt()
  .setExpirationTime('20m')
  .sign(key);

const ASC_BASE = 'https://api.appstoreconnect.apple.com';

async function ascApi(method, path, body = null) {
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
      json?.errors?.map((e) => `${e.code}: ${e.detail ?? e.title}`).join('; ') ?? text.slice(0, 300);
    fail(`App Store Connect API ${response.status}: ${detail}`);
  }
  return json?.data ?? json;
}

// 1. Find the processed build by build number (version attribute).
const builds = await ascApi(
  'GET',
  `/v1/apps/${appId}/builds?fields[builds]=version,processingState,expired,uploadedDate&limit=50`,
);
const buildArr = Array.isArray(builds) ? builds : [builds];
const candidate = buildArr.find((b) => String(b.attributes?.version) === String(build));
if (!candidate) {
  fail(`No build found for app ${appId} with build number ${build}. It may still be processing.`);
}
const buildId = candidate.id;
const state = candidate.attributes?.processingState;
console.log(`[builds] Found build ${candidate.attributes?.version} id=${buildId} state=${state} expired=${candidate.attributes?.expired}`);
if (statusMode) {
  console.log('OK — (status only) no metadata change made.');
  process.exit(0);
}
if (state && state !== 'VALID') {
  console.log(`⚠  Build processingState is ${state} — "What to Test" may be ignored until it is VALID.`);
}

// 2. Read existing betaBuildLocalizations for the build.
const localizations = await ascApi(
  'GET',
  `/v1/builds/${buildId}/betaBuildLocalizations?fields[betaBuildLocalizations]=locale,whatsNew`,
);
const locArr = (Array.isArray(localizations) ? localizations : [localizations]).filter(Boolean);
const enCa = locArr.find((l) => (l.attributes?.locale ?? '').toLowerCase().startsWith('en'));

if (enCa) {
  console.log(`[localization] Updating ${enCa.attributes.locale} (id=${enCa.id})…`);
  await ascApi('PATCH', `/v1/betaBuildLocalizations/${enCa.id}`, {
    data: { type: 'betaBuildLocalizations', id: enCa.id, attributes: { whatsNew } },
  });
} else {
  console.log('[localization] Creating en-CA localization…');
  await ascApi('POST', '/v1/betaBuildLocalizations', {
    data: {
      type: 'betaBuildLocalizations',
      attributes: { locale: 'en-CA', whatsNew },
      relationships: { build: { data: { type: 'builds', id: buildId } } },
    },
  });
}

// 3. Verify.
const verified = await ascApi(
  'GET',
  `/v1/builds/${buildId}/betaBuildLocalizations?fields[betaBuildLocalizations]=locale,whatsNew`,
);
const vArr = (Array.isArray(verified) ? verified : [verified]).filter(Boolean);
const vEn = vArr.find((l) => (l.attributes?.locale ?? '').toLowerCase().startsWith('en'));
console.log('[done] What-to-Test now:');
console.log(`  locale=${vEn?.attributes?.locale ?? 'n/a'}`);
console.log(`  whatsNew=${vEn?.attributes?.whatsNew ?? 'EMPTY'}`);
if (!vEn?.attributes?.whatsNew) fail('whatsNew is empty after update — check the localized text.');
console.log('OK — TestFlight "What to Test" metadata set.');
