# E2E Testing (Maestro)

This directory contains Maestro end-to-end test flows for the mobile app.

## Prerequisites

1. **Maestro CLI** — Install via Homebrew:
   ```bash
   brew install maestro
   ```
   Verify: `maestro --version`

2. **Dev build** — Build the app once (rebuild only when native deps change):
   ```bash
   cd apps/mobile
   npx expo run:ios --configuration Release
   # Output: ios/build/Build/Products/Release-iphonesimulator/ZeroToHero.app
   ```

3. **Test accounts** — Seed E2E test data on the backend:
   ```bash
   export E2E_PASS='<password>'
   bash scripts/setup-e2e-env.sh
   ```

4. **Environment variables** — Create `.env.e2e` in the repo root (gitignored):
   ```
   E2E_FREE_PASS=<password>
   E2E_PRO_PASS=<password>
   E2E_UNVERIFIED_PASS=<password>
   E2E_NEW_PASS=<password>
   ```

## Running Tests

### Smoke test (~30s)
Quick check that the app launches, login works, and tabs render:
```bash
maestro test apps/mobile/e2e/smoke.yaml
```

### Single screen suite
Run a specific screen's tests (faster than full regression for iteration):
```bash
maestro test apps/mobile/e2e/screens/auth.yaml
```

### Full regression (~50min)
Run all auto tests in order:
```bash
maestro test apps/mobile/e2e/regression.yaml
```

### Passing env vars
```bash
maestro test apps/mobile/e2e/smoke.yaml --env-file .env.e2e
```

## Preflight Checklist

Before running tests, ensure:

- [ ] Simulator is booted (`xcrun simctl boot "iPhone 15 Pro"`)
- [ ] App is installed (`xcrun simctl install booted <path>/ZeroToHero.app`)
- [ ] No stale auth token (run preflight or `xcrun simctl uninstall booted ca.zerotohero.app`)
- [ ] Flask server is running on `http://127.0.0.1:5001`
- [ ] Test accounts exist (`bash scripts/setup-e2e-env.sh` — rerun if backend data was reset)

Full reset:
```bash
xcrun simctl shutdown booted 2>/dev/null || true
xcrun simctl boot "iPhone 15 Pro"
xcrun simctl uninstall booted ca.zerotohero.app
xcrun simctl install booted apps/mobile/ios/build/Build/Products/Release-iphonesimulator/ZeroToHero.app
```

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| Maestro can't find element | `testID` not forwarded to native view | Check if element is wrapped in `@rn-primitives/*` — use `nativeID` or `id` prop instead of `testID` |
| App stays on login screen when it should be logged in | Stale Keychain token from previous run | `xcrun simctl uninstall booted ca.zerotohero.app` then reinstall |
| Login succeeds but tabs don't appear | Network timeout / Flask not running | Start Flask: `cd zerotohero-python-server && python3.10 app.py` |
| "No entries found" in dictionary tests | Dictionary data not available | Check `bash scripts/setup-e2e-env.sh` dictionary validation |
| Flaky assertions | Timing — element not yet rendered | Increase `TIMEOUT` in `config.yaml` or add `waitFor` before assert |

## TestID Conventions

- Format: `screen-element-purpose` (e.g., `login-email-input`, `header-hamburger-button`)
- Use the `e2e()` helper from `lib/e2e.ts` — it strips testIDs in production builds
- For `@rn-primitives/*` components (Dialog, Select, Tabs, Switch), pass `testID` via `nativeID` or `id` prop
