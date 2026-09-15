#!/usr/bin/env node
/**
 * Install + launch the newest retained dev (Debug) build onto a physical iOS
 * device — the LAN-change-proof path (ARCH-028 § "Install a retained dev build
 * onto the device (LAN-change-proof)").
 *
 * Usage:
 *   node scripts/install-dev-build.mjs [options]
 *
 *     --device <udid|name>   Target device (default: the only reachable iOS
 *                            device; pass a UDID when several are connected)
 *     --artifact <path.zip>  Install a specific artifact instead of the newest
 *                            retained one
 *     --metro-host <ip>      Override the Mac LAN IP used for Metro
 *     --no-launch            Install only, don't launch
 *     --dry-run              Print the plan, install/launch nothing
 *
 * Why this exists: a Debug build carries no JS bundle, and its Metro host is
 * BAKED at build time into `ip.txt`. When the Mac's LAN IP changes after the
 * build, the app opens to the redbox "No script URL provided …
 * unsanitizedScriptURLString = (null)" and shake cannot open the dev menu
 * (RCTDevMenu's showOnShake requires an RCTView in the window hierarchy, which
 * needs a rendered bundle). This script sidesteps all of that by launching the
 * app with `-RCT_jsLocation <current-lan-ip>:8081`, which NSUserDefaults reads
 * from the highest-priority argument domain and RCTBundleURLProvider prefers
 * over the bundled ip.txt. No rebuild, no repo mutation.
 */

import { execFileSync, execSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parseLedger, parseDevCell } from './version-lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const STORE_DIR = process.env.LP_DEV_BUILD_DIR || join(ROOT, '.dev-builds');
const BUNDLE_ID = 'ca.zerotohero.go';
const METRO_PORT = 8081;
const PLATFORM = 'ios-device';

const USAGE = `Usage: node scripts/install-dev-build.mjs [--device <udid|name>] [--artifact <zip>]
                                        [--metro-host <ip>] [--no-launch] [--dry-run]`;

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`✓ ${msg}`);
}

function warn(msg) {
  console.log(`⚠ ${msg}`);
}

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// ── Arguments ────────────────────────────────────

const opts = { device: null, artifact: null, metroHost: null, launch: true, dryRun: false };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  const value = () => {
    if (i + 1 >= argv.length) fail(`${arg} needs a value\n\n${USAGE}`);
    return argv[++i];
  };
  if (arg === '--device') opts.device = value();
  else if (arg === '--artifact') opts.artifact = value();
  else if (arg === '--metro-host') opts.metroHost = value();
  else if (arg === '--no-launch') opts.launch = false;
  else if (arg === '--dry-run') opts.dryRun = true;
  else if (arg === '-h' || arg === '--help') {
    console.log(USAGE);
    process.exit(0);
  } else fail(`Unknown argument: ${arg}\n\n${USAGE}`);
}

// ── Helpers ──────────────────────────────────────

/** The Mac's current LAN IP — derived at run time, never from a stored value. */
function lanIP() {
  if (opts.metroHost) return opts.metroHost;
  for (const iface of ['en0', 'en1']) {
    try {
      const ip = sh(`ipconfig getifaddr ${iface}`);
      if (ip) return ip;
    } catch {
      /* interface down — try the next one */
    }
  }
  return null;
}

/** Newest retained ios-device dev build, preferring ledger rows whose artifact is on disk. */
function newestRetained() {
  if (opts.artifact) {
    const path = resolve(opts.artifact);
    if (!existsSync(path)) fail(`--artifact not found: ${path}`);
    const n = Number((path.match(/lp-dev-(\d+)-/) || [])[1]);
    return { path, name: path.split('/').pop(), n: Number.isNaN(n) ? null : n, commit: null };
  }

  const fromLedger = parseLedger()
    .flatMap((row) => parseDevCell(row.dev).map((d) => ({ ...d, commit: row.commit })))
    .filter((d) => d.artifact.includes(`-${PLATFORM}-`) && d.status === 'active')
    .filter((d) => existsSync(join(STORE_DIR, d.artifact)))
    .sort((a, b) => b.n - a.n);

  if (fromLedger.length) {
    const d = fromLedger[0];
    return { path: join(STORE_DIR, d.artifact), name: d.artifact, n: d.n, commit: d.commit };
  }

  // Ledger lagging (or row not yet written) — fall back to the store itself.
  const onDisk = existsSync(STORE_DIR)
    ? readdirSync(STORE_DIR)
        .filter((f) => new RegExp(`^lp-dev-\\d+-${PLATFORM}-.*\\.zip$`).test(f))
        .map((f) => ({ f, mtime: statSync(join(STORE_DIR, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime)
    : [];

  if (!onDisk.length) {
    fail(
      `No retained ${PLATFORM} dev build in ${STORE_DIR}\n` +
        `   Make one with: node scripts/dev-build.mjs ${PLATFORM}`,
    );
  }
  const name = onDisk[0].f;
  return { path: join(STORE_DIR, name), name, n: Number((name.match(/lp-dev-(\d+)-/) || [])[1]), commit: null };
}

function appDirInZip(zip) {
  const entries = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n');
  const top = entries.find((e) => /^[^/]+\.app\/$/.test(e));
  if (!top) fail(`No .app directory inside ${zip}`);
  return top.replace(/\/$/, '');
}

/** The Metro host baked in at build time (`ip.txt`) — the value that goes stale. */
function bakedHost(zip, appDir) {
  try {
    return execFileSync('unzip', ['-p', zip, `${appDir}/ip.txt`], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function devices() {
  const out = join(tmpdir(), `lp-devicectl-${process.pid}.json`);
  execFileSync('xcrun', ['devicectl', 'list', 'devices', '--json-output', out], { stdio: ['ignore', 'ignore', 'ignore'] });
  const parsed = JSON.parse(readFileSync(out, 'utf8'));
  return (parsed.result?.devices ?? []).map((d) => ({
    name: d.deviceProperties?.name ?? '(unnamed)',
    udid: d.hardwareProperties?.udid ?? null,
    type: d.hardwareProperties?.deviceType ?? null,
    model: d.hardwareProperties?.marketingName ?? '',
    transport: d.connectionProperties?.transportType ?? null,
  }));
}

function resolveDevice() {
  let all;
  try {
    all = devices();
  } catch (e) {
    fail(
      `Could not list devices: ${String(e.message).split('\n')[0]}\n` +
        '   devicectl talks to CoreDeviceService — run this outside a restricted sandbox.',
    );
  }

  if (opts.device) {
    const wanted = opts.device.replace(/[’']/g, "'");
    const hit = all.find((d) => d.udid === opts.device || d.name.replace(/[’']/g, "'") === wanted);
    return hit ?? { name: opts.device, udid: opts.device, model: '', transport: null };
  }

  // transportType is null for devices CoreDevice cannot currently reach.
  const reachable = all.filter((d) => (d.type === 'iPad' || d.type === 'iPhone') && d.transport);
  if (reachable.length === 1) return reachable[0];
  if (!reachable.length) {
    fail(
      'No reachable iOS device found.\n' +
        '   Connect and unlock the device (USB-C gives the most reliable tunnel), then retry —\n' +
        '   or pass --device <udid>.',
    );
  }
  fail(
    `Several iOS devices are reachable — pass --device <udid>:\n${reachable
      .map((d) => `   ${d.udid}  ${d.name} (${d.model})`)
      .join('\n')}`,
  );
}

function metroReachable(ip) {
  try {
    return sh(`curl -s --max-time 4 http://${ip}:${METRO_PORT}/status`).includes('packager-status:running');
  } catch {
    return false;
  }
}

function metroListening() {
  try {
    sh(`lsof -ti:${METRO_PORT}`);
    return true;
  } catch {
    return false;
  }
}

/** EXPO_PUBLIC_API_URL from apps/mobile/.env — inlined by Metro at serve time. */
function envApiUrl() {
  const file = join(ROOT, 'apps/mobile/.env');
  if (!existsSync(file)) return null;
  const m = readFileSync(file, 'utf8').match(/^\s*EXPO_PUBLIC_API_URL\s*=\s*(\S+)/m);
  return m ? m[1] : null;
}

// ── Plan ─────────────────────────────────────────

const ip = lanIP();
if (!ip) fail('Could not determine the Mac LAN IP (ipconfig getifaddr en0/en1). Pass --metro-host <ip>.');

const build = newestRetained();
const appDir = appDirInZip(build.path);
const baked = bakedHost(build.path, appDir);
const device = resolveDevice();
const listening = metroListening();
const reachable = listening && metroReachable(ip);

let verified = null;
if (build.n) {
  try {
    const out = execFileSync(process.execPath, [join(ROOT, 'scripts', 'verify-dev-build.mjs'), String(build.n)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    verified = out.trim().split('\n').pop().trim();
  } catch {
    verified = `verify-dev-build.mjs ${build.n} FAILED — inspect the artifact before trusting it`;
  }
}

console.log(`\nInstall dev build — ${PLATFORM} (LAN-change-proof)\n`);
console.log(`  artifact   : ${build.name}${build.n ? `  (dev ${build.n}${build.commit ? `, ${build.commit}` : ''})` : ''}`);
console.log(`  baked host : ${baked ?? '(no ip.txt in this artifact)'}`);
console.log(`  Mac LAN IP : ${ip}`);
console.log(`  device     : ${device.name}${device.model ? ` — ${device.model}` : ''}${device.udid ? `\n               ${device.udid}` : ''}`);
console.log(`  metro      : ${reachable ? `reachable at http://${ip}:${METRO_PORT}` : `NOT reachable at http://${ip}:${METRO_PORT}`}`);
console.log(`  launch arg : -RCT_jsLocation ${ip}:${METRO_PORT}${baked === ip ? '  (baked host already matches this LAN)' : '  (needed — the baked host is stale)'}`);
if (verified) console.log(`  ledger     : ${verified}`);
console.log('');

// ── Pre-flight ───────────────────────────────────

if (!listening) {
  fail(
    `Metro is not running on port ${METRO_PORT} — the app would open to a redbox.\n` +
      `   Start it (one instance only):\n` +
      `     cd apps/mobile && source ~/.nvm/nvm.sh && nvm use 22\n` +
      `     export EXPO_PUBLIC_API_URL=http://${ip}:5001\n` +
      `     ulimit -n 65536 && npx expo start\n` +
      '   Or install without launching: --no-launch',
  );
}
if (!reachable) {
  warn(`Metro is listening but http://${ip}:${METRO_PORT}/status did not answer — the device may not reach it at this IP.`);
}

const apiUrl = envApiUrl();
if (apiUrl && !apiUrl.includes(ip)) {
  warn(
    `apps/mobile/.env has EXPO_PUBLIC_API_URL=${apiUrl}.\n` +
      `     If Metro was started without EXPO_PUBLIC_API_URL exported, the bundle inlines that stale\n` +
      `     host and every Flask call fails. Restart Metro with:\n` +
      `       export EXPO_PUBLIC_API_URL=http://${ip}:5001`,
  );
}

if (opts.dryRun) {
  console.log('Dry run — nothing installed or launched.\n');
  process.exit(0);
}

// ── Install ──────────────────────────────────────

const dir = mkdtempSync(join(tmpdir(), 'lp-dev-'));
execFileSync('unzip', ['-q', build.path, '-d', dir], { stdio: 'inherit' });
const appPath = join(dir, appDir);
if (!existsSync(appPath)) fail(`Unzip did not produce ${appPath}`);

let installed = false;
for (let attempt = 1; attempt <= 2 && !installed; attempt++) {
  try {
    execFileSync('xcrun', ['devicectl', 'device', 'install', 'app', '--device', device.udid, appPath], {
      stdio: 'inherit',
    });
    installed = true;
  } catch {
    if (attempt === 1) {
      warn('Install failed — retrying once (CoreDevice tunnels drop while a device sits idle; keep it awake and unlocked).');
    }
  }
}
if (!installed) {
  fail('Install failed twice. See ARCH-028 § "Install a retained dev build onto the device" → Troubleshooting.');
}
ok(`Installed ${appDir} to ${device.name}`);

// ── Launch (with the LAN override) ───────────────

if (opts.launch) {
  execFileSync(
    'xcrun',
    // '--' is essential: without it devicectl parses -RCT_jsLocation as its own flag.
    ['devicectl', 'device', 'process', 'launch', '--device', device.udid, '--terminate-existing', BUNDLE_ID, '--', '-RCT_jsLocation', `${ip}:${METRO_PORT}`],
    { stdio: 'inherit' },
  );
  ok(`Launched ${BUNDLE_ID} against Metro at http://${ip}:${METRO_PORT}`);
  console.log(`\nTo make it permanent: shake → dev menu → Configure Bundler → ${ip}:${METRO_PORT}\n`);
}
