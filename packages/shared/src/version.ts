/**
 * Single source of truth for the Language Player product release version.
 *
 * SPEC-076: web and mobile share this version (feature parity, maintained
 * together). The values live in version.json so apps/mobile/app.config.js
 * can read them directly at Expo config time. Consumed store build numbers
 * are tracked in docs/versioning/build-ledger.md. The Chrome extension has
 * its own independent 4-part version in
 * apps/chrome-extension/manifest.json.
 */

import versionInfo from './version.json';

export const PRODUCT_VERSION: string = versionInfo.PRODUCT_VERSION;
export const PRODUCT_BUILD_NUMBER: number = versionInfo.PRODUCT_BUILD_NUMBER;
