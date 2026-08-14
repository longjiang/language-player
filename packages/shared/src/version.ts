/**
 * Single source of truth for the Language Player product release version.
 *
 * SPEC-076: web and mobile share this version (feature parity, maintained
 * together). Store build numbers live in apps/mobile/app.json and are
 * tracked in docs/versioning/build-ledger.md. The Chrome extension has its
 * own independent 4-part version in apps/chrome-extension/manifest.json.
 */
export const PRODUCT_VERSION = '3.0.0';
