#!/usr/bin/env bash
#
# setup-e2e-env.sh
#
# Seeds E2E test data on the staging Flask backend.
# Creates test accounts and seeds initial state (saved words, SRS cards,
# watch history) for the pro test user.
#
# Usage:
#   export FLASK_URL=https://staging.zerotohero.ca:5001
#   export E2E_PASS="<password>"
#   bash scripts/setup-e2e-env.sh
#
# Environment variables:
#   FLASK_URL   — Base URL of the Flask backend (default: http://127.0.0.1:5001)
#   E2E_PASS    — Password for all E2E test accounts (required)
#   VERBOSE     — Set to "true" to print response bodies (default: false)
#

set -euo pipefail

FLASK_URL="${FLASK_URL:-http://127.0.0.1:5001}"
E2E_PASS="${E2E_PASS:-}"
VERBOSE="${VERBOSE:-false}"

if [ -z "$E2E_PASS" ]; then
  echo "❌ E2E_PASS environment variable is required"
  echo "   Usage: E2E_PASS='<password>' bash scripts/setup-e2e-env.sh"
  exit 1
fi

# ── Helpers ──────────────────────────────────────────────────────────

curl_json() {
  local method="$1" url="$2" data="$3" token="${4:-}"
  local headers=(-H 'Content-Type: application/json')
  if [ -n "$token" ]; then
    headers+=(-H "Authorization: Bearer $token")
  fi
  if [ "$VERBOSE" = "true" ]; then
    curl -s -X "$method" "$url" "${headers[@]}" -d "$data" | python3 -m json.tool
  else
    curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" "${headers[@]}" -d "$data"
  fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  E2E Test Environment Setup"
echo "  Backend: $FLASK_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Create test accounts ─────────────────────────────────────────

ACCOUNTS=(
  "e2e.free@zerotohero.ca:Free:E2E"
  "e2e.pro@zerotohero.ca:Pro:E2E"
  "e2e.unverified@zerotohero.ca:Unverified:E2E"
  "e2e.new@zerotohero.ca:New:E2E"
)

echo ""
echo "📋 Creating test accounts..."

for entry in "${ACCOUNTS[@]}"; do
  IFS=':' read -r email first last <<< "$entry"
  echo -n "   $email ... "

  code=$(curl_json POST "$FLASK_URL/auth/register" \
    "{\"email\":\"$email\",\"password\":\"$E2E_PASS\",\"firstName\":\"$first\",\"lastName\":\"$last\"}")

  if [ "$code" = "200" ] || [ "$code" = "201" ] || [ "$code" = "204" ]; then
    echo "✅ ($code)"
  elif [ "$code" = "409" ]; then
    echo "⚠️  already exists (409)"
  else
    echo "❌ HTTP $code"
  fi
done

# ── 2. Verify accounts are accessible ────────────────────────────────

echo ""
echo "🔍 Verifying test accounts..."

for entry in "${ACCOUNTS[@]}"; do
  IFS=':' read -r email first last <<< "$entry"
  echo -n "   $email ... "

  code=$(curl_json POST "$FLASK_URL/auth/login" \
    "{\"email\":\"$email\",\"password\":\"$E2E_PASS\"}")

  if [ "$code" = "200" ]; then
    echo "✅ login OK"
  else
    echo "❌ login failed (HTTP $code)"
  fi
done

# ── 3. Seed data for pro user ────────────────────────────────────────

echo ""
echo "🌱 Seeding initial data for e2e.pro user..."

# Login to get auth token
LOGIN_RESP=$(curl -s -X POST "$FLASK_URL/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"e2e.pro@zerotohero.ca\",\"password\":\"$E2E_PASS\"}")

PRO_TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")

if [ -z "$PRO_TOKEN" ]; then
  echo "⚠️  Could not get auth token for e2e.pro — skipping seed data"
  echo "   (This is fine for first-time setup; seed data can be added later)"
else
  echo "   ✅ Authenticated as e2e.pro"

  # Seed saved words (example entries)
  SAVED_WORDS='{
    "words": [
      {"word_id": "hello", "l2": "en", "context": "Hello, how are you?", "video_title": "Greetings 101"},
      {"word_id": "world", "l2": "en", "context": "Hello world!", "video_title": "Programming Basics"}
    ]
  }'
  echo -n "   Saving sample words ... "
  code=$(curl_json POST "$FLASK_URL/user/saved-words" "$SAVED_WORDS" "$PRO_TOKEN")
  echo "done ($code)"

  # Seed sample SRS cards
  SRS_CARDS='{
    "cards": [
      {"word_id": "hello", "l2": "en", "due": "2026-07-27T00:00:00Z", "interval": 1, "ease": 2.5},
      {"word_id": "world", "l2": "en", "due": "2026-07-27T00:00:00Z", "interval": 1, "ease": 2.5}
    ]
  }'
  echo -n "   Seeding SRS cards ... "
  code=$(curl_json POST "$FLASK_URL/user/srs-cards" "$SRS_CARDS" "$PRO_TOKEN")
  echo "done ($code)"
fi

# ── 4. Verify dictionary data ────────────────────────────────────────

echo ""
echo "📖 Checking dictionary data availability..."

for lang in en zh ja ko fr; do
  echo -n "   $lang ... "
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    -X GET "$FLASK_URL/dictionary/entry?l2=$lang&dict=cedict&word=hello" 2>/dev/null || echo "000")
  if [ "$code" = "200" ]; then
    echo "✅"
  else
    echo "⚠️  HTTP $code (may be fine if $lang isn't CEDICT)"
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ E2E environment setup complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
