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
 *     --metro-host <ip>      Override the Metro host (IP or hostname)
 *     --metro-scheme <s>     http (default) or https for a tunneled Metro
 *     --verify-timeout <s>   Seconds to wait for the device to reach Metro
 *                            after launch (default 60; 0 disables)
 *     --no-launch            Install only, don't launch
 *     --dry-run              Print the plan, install/launch nothing
 *
 * Why this exists: a Debug build carries no JS bundle, and its Metro host is
 * BAKED at build time into `ip.txt`. When the Mac's LAN IP changes after the
 * build, the app opens to the redbox "No script URL provided …
 * unsanitizedScriptURLString = (null)" and shake cannot open the dev menu
 * (RCTDevMenu's showOnShake requires an RCTView in the window hierarchy, which
 * needs a rendered bundle). This script sidesteps all of that by launching the
 * app with `-RCT_jsLocation <host>:<port>`, which NSUserDefaults reads from the
 * highest-priority argument domain and RCTBundleURLProvider prefers over the
 * bundled ip.txt. No rebuild, no repo mutation.
 *
 * The host comes from the session `start-metro.sh` recorded
 * (`.dev-builds/metro-runtime.json`) when that file is fresh, so the launch
 * always matches the Metro that is actually running — including a tunnel host
 * (with `-RCT_packager_scheme https`) that no LAN heuristic could guess. After
 * launching it *verifies* the device actually connected, which is the only way
 * to catch an isolating network from the Mac side.
 */

import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parseLedger, parseDevCell } from './version-lib.mjs';
import {
  preferredHost,
  readMetroRuntime,
  metroPeerIps,
  isMetroReachable,
  isMetroListening,
} from './network-lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const STORE_DIR = process.env.LP_DEV_BUILD_DIR || join(ROOT, '.dev-builds');
const BUNDLE_ID = 'ca.zerotohero.go';
const METRO_PORT = 8081;
const PLATFORM = 'ios-device';

const USAGE = `Usage: node scripts/install-dev-build.mjs [--device <udid|name>] [--artifact <zip>]
                                        [--metro-host <ip>] [--metro-scheme <http|https>]
                                        [--verify-timeout <s>] [--no-launch] [--dry-run]`;

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

/** Synchronous sleep — no subprocess, no busy-wait. */
function sleep(seconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

// ── Arguments ────────────────────────────────────

const opts = { device: null, artifact: null, metroHost: null, metroScheme: null, launch: true, dryRun: false, verifyTimeout: 60 };
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
  else if (arg === '--metro-scheme') opts.metroScheme = value();
  else if (arg === '--verify-timeout') opts.verifyTimeout = Number(value());
  else if (arg === '--no-launch') opts.launch = false;
  else if (arg === '--dry-run') opts.dryRun = true;
  else if (arg === '-h' || arg === '--help') {
    console.log(USAGE);
    process.exit(0);
  } else fail(`Unknown argument: ${arg}\n\n${USAGE}`);
}

// ── Helpers ──────────────────────────────────────

/**
 * The Metro endpoint the device should be launched against.
 *
 * Priority: an explicit `--metro-host`, then the session recorded by
 * `start-metro.sh`, then auto-detection. The recorded session wins over
 * detection because it is the only source that knows whether Metro is being
 * served over the LAN or through a tunnel (and on which port).
 */
function metroEndpoint() {
  if (opts.metroHost) {
    return {
      host: opts.metroHost,
      port: METRO_PORT,
      localPort: METRO_PORT,
      scheme: opts.metroScheme ?? 'http',
      mode: 'lan',
      source: '--metro-host',
    };
  }

  const runtime = readMetroRuntime();

  if (runtime?.fresh && runtime.host) {
    return {
      host: runtime.host,
      port: runtime.port ?? METRO_PORT,
      // What Metro listens on locally — 8081 even when the device dials 443.
      localPort: runtime.localPort ?? METRO_PORT,
      scheme: opts.metroScheme ?? runtime.scheme ?? 'http',
      mode: runtime.mode ?? 'lan',
      source: `recorded by start-metro.sh (${runtime.mode} session)`,
      deviceHint: runtime.deviceHint ?? null,
    };
  }

  // Nothing recorded: fall back to detection, biased by where the device was
  // last seen (or is seen right now) — that interface is the one known to be
  // able to reach it.
  const livePeers = metroPeerIps(METRO_PORT);
  const hintIp = runtime?.deviceHint ?? livePeers[0] ?? null;
  const pick = preferredHost({ hintIp });
  if (!pick) return null;

  return {
    host: pick.host,
    port: METRO_PORT,
    localPort: METRO_PORT,
    scheme: opts.metroScheme ?? 'http',
    mode: 'lan',
    source: pick.reason,
    deviceHint: runtime?.deviceHint ?? null,
  };
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

/**
 * Wait for the device to actually reach Metro.
 *
 * This is the only device-reachability signal observable from the Mac: once
 * the bundle has loaded, the dev client holds sockets open to Metro for HMR,
 * so a non-loopback peer on the Metro port means the launch succeeded. Its
 * absence means the device has no route to this host — the isolating-network
 * case, which no amount of address detection can fix.
 */
function waitForDeviceConnection(port, timeoutSeconds) {
  if (timeoutSeconds <= 0) return { connected: false, skipped: true };
  const deadline = Date.now() + timeoutSeconds * 1000;
  let seen = [];
  while (Date.now() < deadline) {
    seen = metroPeerIps(port);
    if (seen.length) return { connected: true, peers: seen };
    sleep(2);
  }
  return { connected: false, peers: seen };
}

/** EXPO_PUBLIC_API_URL from apps/mobile/.env — inlined by Metro at serve time. */
function envApiUrl() {
  const file = join(ROOT, 'apps/mobile/.env');
  if (!existsSync(file)) return null;
  const m = readFileSync(file, 'utf8').match(/^\s*EXPO_PUBLIC_API_URL\s*=\s*(\S+)/m);
  return m ? m[1] : null;
}

// ── Plan ─────────────────────────────────────────

const ep = metroEndpoint();
if (!ep) fail('Could not determine a Metro host (no usable IPv4 interface). Pass --metro-host <ip>.');

const build = newestRetained();
const appDir = appDirInZip(build.path);
const baked = bakedHost(build.path, appDir);
const device = resolveDevice();
const listening = isMetroListening(ep.localPort ?? METRO_PORT);
const reachable = listening && isMetroReachable(ep.host, ep.port, ep.scheme);
const launchArgs = [`-RCT_jsLocation`, `${ep.host}:${ep.port}`];
if (ep.scheme !== 'http') launchArgs.push('-RCT_packager_scheme', ep.scheme);

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
console.log(`  metro host : ${ep.scheme}://${ep.host}:${ep.port}  (${ep.source})`);
console.log(`  device     : ${device.name}${device.model ? ` — ${device.model}` : ''}${device.udid && device.udid !== device.name ? `\n               ${device.udid}` : ''}`);
console.log(`  metro      : ${reachable ? 'reachable' : `NOT reachable at ${ep.scheme}://${ep.host}:${ep.port}`}`);
console.log(`  launch arg : ${launchArgs.join(' ')}${baked === ep.host ? '  (baked host already matches)' : ''}`);
if (verified) console.log(`  ledger     : ${verified}`);
console.log('');

// ── Pre-flight ───────────────────────────────────

if (opts.launch && !listening) {
  fail(
    `Metro is not running on port ${ep.port} — the app would open to a redbox.\n` +
      `   Start it (one instance only, derives the host itself):\n` +
      `     scripts/start-metro.sh --device ${device.udid ?? '<udid>'}\n` +
      '   Or install without launching: --no-launch',
  );
}
if (listening && !reachable) {
  warn(
    `Metro is listening but ${ep.scheme}://${ep.host}:${ep.port}/status did not answer.\n` +
      `     The device will not be able to load JS from this host.`,
  );
}

const apiUrl = envApiUrl();
if (apiUrl && !apiUrl.includes(ep.host)) {
  warn(
    `apps/mobile/.env has EXPO_PUBLIC_API_URL=${apiUrl}.\n` +
      `     If Metro was started without EXPO_PUBLIC_API_URL exported, the bundle inlines that stale\n` +
      `     host and every Flask call fails. Restart Metro with:\n` +
      `       scripts/start-metro.sh`,
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

// ── Launch (with the Metro override) ─────────────

if (opts.launch) {
  execFileSync(
    'xcrun',
    // '--' is essential: without it devicectl parses -RCT_jsLocation as its own flag.
    ['devicectl', 'device', 'process', 'launch', '--device', device.udid, '--terminate-existing', BUNDLE_ID, '--', ...launchArgs],
    { stdio: 'inherit' },
  );
  ok(`Launched ${BUNDLE_ID} against Metro at ${ep.scheme}://${ep.host}:${ep.port}`);

  // ── Verify the device actually reached Metro ───
  //
  // Exit status only proves the install; it says nothing about whether the
  // device can route to this Mac. On an isolating network the app opens to a
  // redbox and nothing else reports it.
  if (ep.scheme !== 'http') {
    // The tunnel agent dials Metro from loopback, so the device's traffic is
    // indistinguishable from any other local client. Claiming a verdict here
    // would be a false negative.
    warn(
      `Tunnel session (${ep.scheme}) — device reachability is not verifiable from here\n` +
        `     (the tunnel agent connects over loopback). Confirm on the device itself.`,
    );
  } else {
    console.log(`\nWaiting up to ${opts.verifyTimeout}s for the device to connect…`);
    const result = waitForDeviceConnection(ep.localPort ?? METRO_PORT, opts.verifyTimeout);

    if (result.connected) {
      ok(`Device connected to Metro from ${result.peers.join(', ')}`);
    } else if (result.skipped) {
      warn('Device-reachability check skipped (--verify-timeout 0).');
    } else {
      warn(
        `No device reached Metro within ${opts.verifyTimeout}s — the app is almost certainly showing\n` +
          `     a redbox. The device has no route to ${ep.scheme}://${ep.host}:${ep.port}.\n` +
          `     Most likely cause: this Wi-Fi isolates clients from each other (common on public,\n` +
          `     hotel and guest networks), which no host detection can work around. Options:\n` +
          `       1. Put both devices on your iPhone's Personal Hotspot, then re-run\n` +
          `          scripts/start-metro.sh (it re-derives the host automatically).\n` +
          `       2. Tunnel Metro (scripts/start-metro.sh --tunnel) — also tunnel Flask and pass\n` +
          `          --api-url https://<flask-tunnel>, since Metro-only tunnelling leaves API\n` +
          `          calls blocked.\n` +
          `       3. Connect the iPad over USB-C for a wired CoreDevice tunnel.\n` +
          `     See ARCH-028 § "Networking conditions".`,
      );
    }
  }

  console.log(`\nTo make it permanent: shake → dev menu → Configure Bundler → ${ep.host}:${ep.port}\n`);
}
