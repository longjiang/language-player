#!/usr/bin/env bash
#
# Start Metro for mobile development — the tracked way (ARCH-028 § "Start
# Metro" and § "Networking conditions").
#
# Why this exists: the manual recipe
#
#     cd apps/mobile && source ~/.nvm/nvm.sh && nvm use 22
#     export EXPO_PUBLIC_API_URL=http://$(ipconfig getifaddr en0):5001
#     ulimit -n 65536 && npx expo start
#
# hardcodes `en0`, which is the wrong interface whenever the device is on the
# Mac's own bridge (macOS Internet Sharing) or a tethered link — and it does
# not record which host Metro was served on, so the installer has to re-derive
# it and can disagree. This script derives the host from the interface that can
# actually reach the device, exports a matching EXPO_PUBLIC_API_URL, proves the
# prerequisites before starting, and records the session in
# `.dev-builds/metro-runtime.json` for `install-dev-build.mjs` to consume.
#
# Usage:
#   scripts/start-metro.sh [options]
#
#     --host <ip|iface>   Force the device-facing host (IP, or an interface
#                         name like en0 / bridge100). Default: auto-detect.
#     --api-url <url>     EXPO_PUBLIC_API_URL override. Use this when Flask is
#                         reached through its own tunnel, e.g.
#                         --api-url https://abc123.ngrok-free.app
#     --lan               Same network as the device (default).
#     --tunnel            Serve Metro through an ngrok tunnel (@expo/ngrok
#                         required). Works when the Wi-Fi isolates clients, but
#                         Metro only — tunnel Flask separately and pass
#                         --api-url so the app can still load data.
#     --localhost         Loopback only. Simulator/Expo Go work only.
#     --port <n>          Metro port. Default 8081 (what the baked build uses).
#     --device <udid|name> Device the printed install command should target.
#     --check             Preflight only: print the plan, start nothing.
#     --log / --no-log    Tee Metro output to .dev-builds/metro.log (default:
#                         on, so `[LP Mobile]` logs survive the scrollback).
#     -h, --help          This text.
#
# Exit codes: 0 ok · 1 usage/preflight failure.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STORE_DIR="${LP_DEV_BUILD_DIR:-$ROOT/.dev-builds}"
RUNTIME_FILE="$STORE_DIR/metro-runtime.json"
LOG_FILE="$STORE_DIR/metro.log"

METRO_PORT=8081
FLASK_PORT=5001

HOST_OVERRIDE=""
API_URL=""
API_URL_GIVEN=0
MODE="lan"
CHECK_ONLY=0
DEVICE=""
USE_LOG=1

say()  { printf '%s\n' "$*"; }
ok()   { printf '✓ %s\n' "$*"; }
warn() { printf '⚠ %s\n' "$*"; }
fail() { printf '❌ %s\n' "$*" >&2; exit 1; }

usage() { sed -n '/^# Usage:/,/^# Exit codes/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)     HOST_OVERRIDE="${2:?--host needs a value}"; shift 2 ;;
    --api-url)  API_URL="${2:?--api-url needs a value}"; API_URL_GIVEN=1; shift 2 ;;
    --device)   DEVICE="${2:?--device needs a value}"; shift 2 ;;
    --port)     METRO_PORT="${2:?--port needs a value}"; shift 2 ;;
    --lan)      MODE="lan"; shift ;;
    --tunnel)   MODE="tunnel"; shift ;;
    --localhost) MODE="localhost"; shift ;;
    --check)    CHECK_ONLY=1; shift ;;
    --log)      USE_LOG=1; shift ;;
    --no-log)   USE_LOG=0; shift ;;
    -h|--help)  usage; exit 0 ;;
    *)          usage >&2; fail "Unknown argument: $1" ;;
  esac
done

# ── Node 22 (Expo SDK 57 requires >= 20.19.4) ────

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1090,SC1091
  source "$HOME/.nvm/nvm.sh"
  nvm use 22 >/dev/null 2>&1 || fail "nvm use 22 failed — is Node 22 installed? (nvm install 22)"
fi
command -v node >/dev/null 2>&1 || fail "node not found on PATH"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  fail "Node $(node -v) is too old — Expo SDK 57 needs >= 20.19.4. Run: nvm use 22"
fi

# ── One Metro per port ───────────────────────────

METRO_PID="$(lsof -ti:"$METRO_PORT" 2>/dev/null | head -1 || true)"
if [[ -n "$METRO_PID" ]]; then
  METRO_CMD="$(ps -o command= -p "$METRO_PID" 2>/dev/null | cut -c1-70 || true)"
  if [[ "$CHECK_ONLY" -eq 1 ]]; then
    warn "Metro already listening on $METRO_PORT (pid $METRO_PID: $METRO_CMD)"
    warn "Reuse that instance — do not start a second one."
  else
    fail "Metro is already running on $METRO_PORT (pid $METRO_PID).
   One instance only. Reuse it, or stop it first (kill $METRO_PID).
   ${METRO_CMD}"
  fi
fi

# ── Resolve the host the device should use ───────

if [[ "$MODE" == "tunnel" ]]; then
  HOST="(resolved by the tunnel)"
  HOST_REASON="ngrok tunnel"
elif [[ -n "$HOST_OVERRIDE" ]]; then
  if HOST_FROM_IFACE="$(ipconfig getifaddr "$HOST_OVERRIDE" 2>/dev/null)"; then
    HOST="$HOST_FROM_IFACE"
    HOST_REASON="--host $HOST_OVERRIDE"
  else
    HOST="$HOST_OVERRIDE"
    HOST_REASON="--host (literal)"
  fi
else
  PICK="$(node "$SCRIPT_DIR/network-lib.mjs" pick)"
  HOST="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).host)' "$PICK")"
  HOST_REASON="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).reason)' "$PICK")"
fi

if [[ "$MODE" == "localhost" ]]; then
  HOST="localhost"
  HOST_REASON="--localhost (simulator only)"
fi

if [[ -z "$API_URL" ]]; then
  if [[ "$MODE" == "tunnel" ]]; then
    # The tunnel carries Metro only, so the tunnel host is not a usable API
    # host. Fall back to this Mac's LAN address rather than baking a bogus
    # hostname into the bundle; --api-url is the supported fix.
    LAN_HOST="$(node "$SCRIPT_DIR/network-lib.mjs" ip 2>/dev/null || true)"
    API_URL="http://${LAN_HOST:-127.0.0.1}:${FLASK_PORT}"
  else
    API_URL="http://${HOST}:${FLASK_PORT}"
  fi
fi

# ── Preflight ────────────────────────────────────

FLASK_STATE="not checked"
if [[ "$MODE" != "tunnel" ]]; then
  # curl always writes a status code (000 on failure), so no `|| echo` fallback:
  # appending one would yield "000000", which is not equal to "000" and would
  # report a dead Flask as answering.
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 4 "http://${HOST}:${FLASK_PORT}/" 2>/dev/null || true)"
  if [[ -z "$CODE" || "$CODE" == "000" ]]; then
    FLASK_STATE="NOT answering on ${HOST}:${FLASK_PORT}"
  else
    FLASK_STATE="answering on ${HOST}:${FLASK_PORT} (HTTP $CODE)"
  fi
fi

FLASK_TUNNEL_WARN=0
if [[ "$MODE" == "tunnel" && "$API_URL_GIVEN" -eq 0 ]]; then
  FLASK_TUNNEL_WARN=1
fi

say ""
say "Start Metro — mode: $MODE"
say "  host       : ${HOST}  (${HOST_REASON})"
if [[ "$MODE" == "tunnel" ]]; then
  say "  metro      : via ngrok tunnel (Expo prints the host once it is up)"
else
  say "  metro      : http://${HOST}:${METRO_PORT}"
fi
say "  api url    : ${API_URL}"
say "  flask      : ${FLASK_STATE}"
say "  node       : $(node -v)"
say "  runtime    : ${RUNTIME_FILE}"
if [[ "$USE_LOG" -eq 1 ]]; then say "  log        : ${LOG_FILE}"; fi
say ""

if [[ "$FLASK_STATE" == NOT* ]]; then
  warn "Flask is not answering. Start it yourself (this script never does):
     cd zerotohero-python-server && python3.10 app.py"
  warn "The app will load but every API call will fail until it is up."
fi

if [[ "$FLASK_TUNNEL_WARN" -eq 1 ]]; then
  warn "Tunnel mode tunnels Metro only — the app still reaches Flask at"
  warn "${API_URL}, which an isolating network will block."
  warn "Tunnel Flask too, then re-run with --api-url https://<your-flask-tunnel>"
fi

if [[ "$MODE" == "tunnel" ]]; then
  if [[ ! -d "$ROOT/node_modules/@expo/ngrok" ]]; then
    warn "@expo/ngrok is not installed — Expo will offer to install it on first run."
  fi
fi

INSTALL_CMD="node scripts/install-dev-build.mjs"
if [[ -n "$DEVICE" ]]; then
  INSTALL_CMD="$INSTALL_CMD --device $DEVICE"
fi

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  say "Preflight only — nothing started."
  say ""
  say "Next, once Metro is up:"
  say "  $INSTALL_CMD"
  say ""
  exit 0
fi

# ── Record the session ───────────────────────────

if [[ "$MODE" != "tunnel" ]]; then
  node "$SCRIPT_DIR/network-lib.mjs" write-runtime \
    "{\"host\":\"${HOST}\",\"port\":${METRO_PORT},\"localPort\":${METRO_PORT},\"scheme\":\"http\",\"mode\":\"${MODE}\",\"apiUrl\":\"${API_URL}\",\"pid\":$$,\"logPath\":\"${LOG_FILE}\"}" >/dev/null
fi

# ── Start ────────────────────────────────────────

EXPO_ARGS=()
case "$MODE" in
  tunnel)    EXPO_ARGS+=(--tunnel) ;;
  localhost) EXPO_ARGS+=(--localhost) ;;
  lan)       EXPO_ARGS+=(--lan) ;;
esac
if [[ "$METRO_PORT" != "8081" ]]; then
  EXPO_ARGS+=(--port "$METRO_PORT")
fi

export EXPO_PUBLIC_API_URL="$API_URL"
ulimit -n 65536 2>/dev/null || warn "could not raise the file-descriptor limit (EMFILE risk)"

WATCHER=""
cleanup() {
  [[ -n "$WATCHER" ]] && kill "$WATCHER" 2>/dev/null || true
}
trap cleanup EXIT

if [[ "$MODE" == "tunnel" ]]; then
  # The tunnel host only exists once Expo prints it — watch the log and record it.
  (
    for _ in $(seq 1 90); do
      URL="$(grep -oE '(https?)://[A-Za-z0-9._-]+\.(exp\.direct|ngrok\.io|ngrok-free\.app|ngrok\.app)' "$LOG_FILE" 2>/dev/null | head -1 || true)"
      if [[ -n "$URL" ]]; then
        THOST="${URL#*://}"
        node "$SCRIPT_DIR/network-lib.mjs" write-runtime \
          "{\"host\":\"${THOST}\",\"port\":443,\"localPort\":${METRO_PORT},\"scheme\":\"https\",\"mode\":\"tunnel\",\"apiUrl\":\"${API_URL}\",\"pid\":$$,\"logPath\":\"${LOG_FILE}\"}" >/dev/null 2>&1 || true
        printf '\n✓ Tunnel host recorded: %s\n' "$THOST" >&2
        break
      fi
      sleep 2
    done
  ) &
  WATCHER=$!
fi

say "Starting Metro — the device loads JS from here. Ctrl-C to stop."
say ""

cd "$ROOT/apps/mobile"

set +e
if [[ "$USE_LOG" -eq 1 ]]; then
  mkdir -p "$STORE_DIR"
  npx expo start "${EXPO_ARGS[@]}" 2>&1 | tee "$LOG_FILE"
  STATUS="${PIPESTATUS[0]}"
else
  npx expo start "${EXPO_ARGS[@]}"
  STATUS=$?
fi
set -e

say ""
if [[ "$STATUS" -eq 0 ]]; then
  ok "Metro stopped."
else
  warn "Metro exited with status $STATUS — see ${LOG_FILE}"
fi
say ""
say "To put the newest retained dev build on the device, in another terminal:"
say "  $INSTALL_CMD"
say ""
exit "$STATUS"
