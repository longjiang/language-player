#!/bin/bash
# Delete the register-and-onboard test user so the test can re-run.
# Requires Flask running locally with ENABLE_TEST_ENDPOINTS=true.
# Run before: maestro test apps/mobile/e2e/screens/auth/register-and-onboard.yaml

FLASK_URL="${FLASK_URL:-http://127.0.0.1:5001}"
TEST_EMAIL="${TEST_EMAIL:-e2e.register.test@zerotohero.ca}"

curl -sf -X DELETE "$FLASK_URL/auth/test-cleanup" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$TEST_EMAIL\"}" && echo "" || true
