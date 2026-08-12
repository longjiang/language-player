# .well-known verification files (SPEC-069)

These files make website links open the Language Player mobile app
(iOS Universal Links / Android App Links).

**Do not deploy until the placeholders are replaced:**

- `apple-app-site-association` — replace `TEAM_ID_PLACEHOLDER` with the Apple
  Developer Team ID (e.g. `ABC123XYZ`).
- `assetlinks.json` — replace `CHANGE_ME_APP_SIGNING_SHA256` with the Android
  app-signing key SHA-256 fingerprint from Play Console → App signing.

After replacing, verify both URLs return the files over HTTPS:

- `https://languageplayer.io/.well-known/apple-app-site-association`
- `https://languageplayer.io/.well-known/assetlinks.json`

See SPEC-069 for the full setup and test steps.
