/**
 * Shared networking helpers for the mobile dev-build pipeline (ARCH-028 §
 * "Networking conditions — how the host is chosen").
 *
 * Why this exists: the host the *device* must use to reach Metro is derived
 * from whatever network the Mac is on, and that changes constantly — venue
 * Wi-Fi, an iPhone hotspot, macOS Internet Sharing, USB/Bluetooth tethering.
 * Two distinct failure modes have to be handled, and they need different
 * answers:
 *
 *   1. **Wrong interface.** `ipconfig getifaddr en0` returns the venue Wi-Fi
 *      address even when the device is actually on the Mac's own bridge
 *      (Internet Sharing) or on a tethered interface. Deriving the answer from
 *      `en0` alone silently produces a host the device cannot reach.
 *   2. **No shared subnet.** Public/guest Wi-Fi commonly isolates clients from
 *      each other (AP isolation), so *no* interface on the Mac can reach the
 *      device. No amount of address detection fixes this; it has to be
 *      detected and reported so the operator can switch links (see ARCH-028
 *      for the matrix of workable links).
 *
 * One source of truth for both, used by `start-metro.sh` (which records the
 * resolved host), `install-dev-build.mjs` (which launches against it) and
 * `dev-build.mjs` (which compares against the baked `ip.txt`).
 */

import { execFileSync, execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));

export const ROOT = resolve(here, '..');
export const STORE_DIR = process.env.LP_DEV_BUILD_DIR || join(ROOT, '.dev-builds');
/** Records which host the *current* Metro session is being served on. */
export const RUNTIME_FILE = join(STORE_DIR, 'metro-runtime.json');
export const METRO_PORT = 8081;
export const FLASK_PORT = 5001;

/**
 * Interfaces that can never carry device→Mac Metro traffic: loopback, tunnels
 * (VPN/utun, awdl/llw peer-to-peer Wi-Fi), and VM/legacy virtual adapters.
 */
const VIRTUAL_IFACE = /^(lo|utun|awdl|llw|anpi|gif|stf|ap|vmnet|vmenet|vnic|p2p|ipsec|tap|tun)/;

function sh(cmd, timeout = 5000) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout }).trim();
  } catch {
    return '';
  }
}

// ── Interfaces ───────────────────────────────────

/** Every non-virtual interface that currently holds an IPv4 address. */
export function interfaceIPv4s() {
  const names = sh('ifconfig -l').split(/\s+/).filter(Boolean);
  const out = [];
  for (const iface of names) {
    if (VIRTUAL_IFACE.test(iface)) continue;
    const ip = sh(`ipconfig getifaddr ${iface}`);
    if (!ip) continue;
    out.push({ iface, ip, linkLocal: ip.startsWith('169.254.') });
  }
  return out;
}

/** The interface carrying the default route (venue Wi-Fi, or a tethered iPhone). */
export function defaultRouteInterface() {
  const out = sh('route -n get default');
  const m = out.match(/^\s*interface:\s*(\S+)/m);
  return m ? m[1] : null;
}

/**
 * Is `ip` on a subnet this Mac is directly attached to?
 *
 * A direct route has an `interface:` line and no `gateway:` line; anything
 * routed off-net has a gateway. This is what distinguishes "the device shares
 * my network" from "the device is behind an isolating AP".
 */
export function deviceIsLocal(ip) {
  if (!ip) return false;
  const out = sh(`route -n get ${ip}`, 4000);
  if (!out) return false;
  const iface = (out.match(/^\s*interface:\s*(\S+)/m) || [])[1];
  const gateway = /^\s*gateway:\s*/m.test(out);
  if (!iface || gateway) return false;
  return !VIRTUAL_IFACE.test(iface);
}

/** The interface the kernel would use to reach `ip`, or null. */
function routeInterfaceFor(ip) {
  const out = sh(`route -n get ${ip}`, 4000);
  const m = out.match(/^\s*interface:\s*(\S+)/m);
  return m ? m[1] : null;
}

// ── Choosing the host the device should use ──────

/**
 * Best IPv4 address for the device to reach Metro on, with the reason.
 *
 * Ranking:
 *  1. `hintIp` — the device's last known address (persisted in the runtime
 *     file, or observed on the Metro socket). If the device is reachable on a
 *     local subnet, that subnet wins over any heuristic: it is the only
 *     candidate that is *known* to work.
 *  2. A `bridge*` interface — macOS Internet Sharing, i.e. a link the operator
 *     deliberately created for the device.
 *  3. The default-route interface — venue Wi-Fi, or a tethered iPhone.
 *  4. Any other physical interface with a routable address, lowest name first.
 *  5. Link-local (169.254.x.x) as a last resort.
 */
function chooseHost({ hintIp = null } = {}) {
  const candidates = interfaceIPv4s();
  if (!candidates.length) return null;

  if (hintIp && deviceIsLocal(hintIp)) {
    const iface = routeInterfaceFor(hintIp);
    const hit = candidates.find((c) => c.iface === iface);
    if (hit) {
      return { ...hit, reason: `device ${hintIp} is on ${iface}`, hintIp };
    }
  }

  const bridge = candidates.find((c) => c.iface.startsWith('bridge') && !c.linkLocal);
  if (bridge) return { ...bridge, reason: 'macOS Internet Sharing bridge' };

  const defIface = defaultRouteInterface();
  const onDefault = candidates.find((c) => c.iface === defIface && !c.linkLocal);
  if (onDefault) return { ...onDefault, reason: `default route (${defIface})` };

  const physical = candidates
    .filter((c) => !c.linkLocal && /^en\d+$/.test(c.iface))
    .sort((a, b) => Number(a.iface.slice(2)) - Number(b.iface.slice(2)))[0];
  if (physical) return { ...physical, reason: 'first routable physical interface' };

  const anyRoutable = candidates.find((c) => !c.linkLocal);
  if (anyRoutable) return { ...anyRoutable, reason: 'only routable interface' };

  return { ...candidates[0], reason: 'link-local only (no routable network)' };
}

/** `chooseHost` with a canonical `host` field, or null when there is no IPv4. */
export function preferredHost(opts = {}) {
  const pick = chooseHost(opts);
  return pick ? { ...pick, host: pick.ip } : null;
}

// ── Liveness probes ──────────────────────────────

export function isMetroListening(port = METRO_PORT) {
  return sh(`lsof -ti:${port}`) !== '';
}

/** Metro's own readiness answer — a bare listening socket is not enough. */
export function isMetroReachable(host, port = METRO_PORT, scheme = 'http') {
  return sh(`curl -sk --max-time 4 ${scheme}://${host}:${port}/status`).includes('packager-status:running');
}

/** Something is answering HTTP on Flask's port — any status counts, even 404. */
export function isFlaskReachable(host, port = FLASK_PORT) {
  const code = sh(`curl -s -o /dev/null -w '%{http_code}' --max-time 4 http://${host}:${port}/`);
  return code !== '' && code !== '000';
}

/**
 * Peers currently holding a connection to Metro — the device shows up here
 * once its JS bundle has loaded (the dev client keeps sockets open for HMR).
 * This is the only device-reachability signal observable from the Mac.
 */
export function metroPeerIps(port = METRO_PORT) {
  const out = sh(`lsof -nP -iTCP:${port} -sTCP:ESTABLISHED`);
  if (!out) return [];
  const ips = out
    .split('\n')
    .slice(1)
    .map((line) => {
      const name = line.split(/\s+/)[8] || '';
      const arrow = name.split('->')[1] || '';
      return arrow.split(':')[0];
    })
    .filter((ip) => ip && !ip.startsWith('127.') && ip !== '[::1]');
  return [...new Set(ips)];
}

// ── Runtime state ────────────────────────────────

/**
 * Where the current Metro session is being served, so the installer launches
 * against *this* session instead of re-deriving (and possibly disagreeing).
 *
 * `port` is what the *device* dials (443 for a tunnel); `localPort` is what
 * Metro actually listens on on this Mac (8081). They differ in tunnel mode,
 * and conflating them breaks the "is Metro up?" check.
 */
export function writeMetroRuntime(data) {
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true });
  const payload = {
    host: data.host ?? null,
    port: data.port ?? METRO_PORT,
    localPort: data.localPort ?? data.port ?? METRO_PORT,
    scheme: data.scheme ?? 'http',
    mode: data.mode ?? 'lan',
    apiUrl: data.apiUrl ?? null,
    pid: data.pid ?? null,
    logPath: data.logPath ?? null,
    deviceHint: data.deviceHint ?? null,
    writtenAt: new Date().toISOString(),
  };
  writeFileSync(RUNTIME_FILE, JSON.stringify(payload, null, 2) + '\n');
  return payload;
}

/**
 * The recorded Metro session, with a `fresh` flag. `fresh` means Metro is
 * still listening *and* the process that recorded it is still alive — a
 * leftover file from a killed session must never be trusted for a launch.
 */
export function readMetroRuntime() {
  if (!existsSync(RUNTIME_FILE)) return null;
  let data;
  try {
    data = JSON.parse(readFileSync(RUNTIME_FILE, 'utf8'));
  } catch {
    return null;
  }
  let pidAlive = true;
  if (data.pid) {
    try {
      process.kill(data.pid, 0);
    } catch {
      pidAlive = false;
    }
  }
  const listening = isMetroListening(data.port ?? METRO_PORT);
  return { ...data, pidAlive, listening, fresh: pidAlive && listening };
}

export function clearMetroRuntime() {
  if (existsSync(RUNTIME_FILE)) writeFileSync(RUNTIME_FILE, '');
}

// ── CLI (used by start-metro.sh) ─────────────────

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const [cmd, arg] = process.argv.slice(2);
  const json = (v) => console.log(JSON.stringify(v));

  switch (cmd) {
    case 'ip': {
      const pick = preferredHost({ hintIp: arg || readMetroRuntime()?.deviceHint || null });
      if (!pick) {
        console.error('no IPv4 interface found');
        process.exit(1);
      }
      console.log(pick.host);
      break;
    }
    case 'pick': {
      const pick = preferredHost({ hintIp: arg || null });
      if (!pick) {
        console.error('no IPv4 interface found');
        process.exit(1);
      }
      json(pick);
      break;
    }
    case 'candidates':
      json(
        interfaceIPv4s().map((c) => ({
          ...c,
          isDefaultRoute: c.iface === defaultRouteInterface(),
        })),
      );
      break;
    case 'device-local':
      process.exit(deviceIsLocal(arg) ? 0 : 1);
      break;
    case 'peers':
      json(metroPeerIps(Number(arg) || METRO_PORT));
      break;
    case 'runtime':
      json(readMetroRuntime());
      break;
    case 'write-runtime': {
      const data = JSON.parse(arg);
      const prev = readMetroRuntime();
      const peers = metroPeerIps(data.port ?? METRO_PORT);
      json(
        writeMetroRuntime({
          ...data,
          // Remember where the device was last seen, so the next run prefers
          // the interface that can actually reach it.
          deviceHint: peers[0] || prev?.deviceHint || null,
        }),
      );
      break;
    }
    default:
      console.error(
        'Usage: node scripts/network-lib.mjs <ip|pick|candidates|device-local <ip>|peers [port]|runtime|write-runtime <json>>',
      );
      process.exit(1);
  }
}
