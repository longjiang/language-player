#!/usr/bin/env node
/**
 * Set the per-build TestFlight tester note ("What to Test") for an uploaded
 * build — ARCH-029 § 4.3.1.
 *
 * Uploading an IPA does not complete the TestFlight release: every build needs
 * a current tester-facing note before it is added to a testing group. Apple's UI
 * calls it "What to Test"; the App Store Connect API exposes the same localized
 * text as `betaBuildLocalizations.whatsNew` (not
 * `appStoreVersionLocalizations.whatsNew`, which is App Store listing copy).
 *
 * Usage:
 *   node scripts/appstore-beta-note.mjs <version> <buildNumber> --whats-new <text>
 *     [--locale en-CA] [--dry-run]
 *
 *   --whats-new accepts inline text or "@path/to/note.txt" to read a file
 *   (use the file form for multi-line notes).
 *
 * Requires (scripts/.env.upload, gitignored — same credentials as
 * `upload.mjs appstore …`):
 *   LP_ASC_KEY_PATH  .p8 private key
 *   LP_ASC_KEY_ID    key id
 *   LP_ASC_ISSUER_ID issuer id
 *   Optional: LP_ASC_APP_ID (default 6520385296)
 *
 * The build must have finished processing in App Store Connect — a build that
 * is still "Processing" is not returned by the API yet, and the script says so
 * rather than writing metadata for the wrong build.
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { createPrivateKey } from 'crypto';
import { SignJWT } from 'jose';
import { paths } from './version-lib.mjs';

const args = process.argv.slice(2);
const positional = args.filter((arg) => !arg.startsWith('--'));
const dryRun = args.includes('--dry-run');

function flagValue(name, fallback = null) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) return fallback;
  return value;
}

// Optional gitignored credential file; real environment variables always win.
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

const [version, buildNumber] = positional;
const locale = flagValue('--locale', 'en-CA');
const whatsNewArg = flagValue('--whats-new');

if (!version || !buildNumber) {
  fail(
    'Usage: node scripts/appstore-beta-note.mjs <version> <buildNumber> ' +
      '--whats-new <text|@file> [--locale en-CA] [--dry-run]',
  );
}
if (!whatsNewArg) {
  fail('Missing --whats-new (inline text, or @path/to/note.txt).');
}

const whatsNew = whatsNewArg.startsWith('@')
  ? readFileSync(resolve(paths.root, whatsNewArg.slice(1)), 'utf8').trim()
  : whatsNewArg.trim();

if (!whatsNew) fail('The tester note is empty.');

const appId = process.env.LP_ASC_APP_ID ?? '6520385296';
const ASC_BASE = 'https://api.appstoreconnect.apple.com';

async function ascToken() {
  const keyPath = process.env.LP_ASC_KEY_PATH;
  const keyId = process.env.LP_ASC_KEY_ID;
  const issuer = process.env.LP_ASC_ISSUER_ID;
  if (!keyPath || !existsSync(keyPath) || !keyId || !issuer) {
    fail(
      'Set LP_ASC_KEY_PATH, LP_ASC_KEY_ID and LP_ASC_ISSUER_ID in scripts/.env.upload (gitignored).',
    );
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
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    const detail = json?.errors?.map((e) => `${e.title}: ${e.detail}`).join('; ') ?? text.slice(0, 300);
    fail(`${method} ${path} failed (${response.status}) — ${detail}`);
  }
  return json;
}

const token = await ascToken();

// 1. Find the processed build for this version + build number.
const builds = await ascApi(
  token,
  'GET',
  `/v1/builds?filter[app]=${appId}` +
    `&filter[version]=${encodeURIComponent(buildNumber)}` +
    `&filter[preReleaseVersion.version]=${encodeURIComponent(version)}` +
    '&limit=1&fields[builds]=version,processingState,expired',
);

const build = builds?.data?.[0];
if (!build) {
  fail(
    `No build ${version} (${buildNumber}) is visible in App Store Connect yet. ` +
      'Apple may still be processing the upload — wait for the build to appear, then re-run.',
  );
}
const state = build.attributes?.processingState ?? 'unknown';
if (state !== 'VALID') {
  fail(
    `Build ${version} (${buildNumber}) is in state "${state}", not VALID — ` +
      'wait for processing to finish, then re-run.',
  );
}

console.log(`Build ${version} (${buildNumber}) — id ${build.id}, state ${state}`);

// 2. Read the existing localizations, then PATCH or create the target locale.
const existing = await ascApi(
  token,
  'GET',
  `/v1/builds/${build.id}/betaBuildLocalizations?limit=50`,
);
const current = existing?.data?.find((entry) => entry.attributes?.locale === locale);

if (dryRun) {
  console.log(`[dry-run] would ${current ? 'PATCH' : 'POST'} the ${locale} tester note:`);
  console.log('---');
  console.log(whatsNew);
  console.log('---');
  process.exit(0);
}

if (current) {
  await ascApi(token, 'PATCH', `/v1/betaBuildLocalizations/${current.id}`, {
    data: {
      type: 'betaBuildLocalizations',
      id: current.id,
      attributes: { whatsNew },
    },
  });
  console.log(`Updated ${locale} tester note on build ${build.id}.`);
} else {
  await ascApi(token, 'POST', '/v1/betaBuildLocalizations', {
    data: {
      type: 'betaBuildLocalizations',
      attributes: { locale, whatsNew },
      relationships: { build: { data: { type: 'builds', id: build.id } } },
    },
  });
  console.log(`Created ${locale} tester note on build ${build.id}.`);
}

// 3. Read it back — the runbook requires the note to be verified, not assumed.
const verify = await ascApi(
  token,
  'GET',
  `/v1/builds/${build.id}/betaBuildLocalizations?limit=50`,
);
const written = verify?.data?.find((entry) => entry.attributes?.locale === locale);
const writtenText = written?.attributes?.whatsNew ?? '';
if (!writtenText.trim()) {
  fail(`The ${locale} tester note reads back empty — check the build in App Store Connect.`);
}
if (!writtenText.includes(version) || !writtenText.includes(buildNumber)) {
  console.log(
    `⚠  The ${locale} note does not mention ${version} (${buildNumber}). Apple recommends ` +
      'the text name the build it belongs to; re-run with an updated --whats-new if that was unintended.',
  );
}
console.log(`✓ ${locale} tester note set (${writtenText.length} chars) and verified.`);
