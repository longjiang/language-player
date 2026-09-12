/**
 * Base URL the mock app HTML is served from (SPEC-095, ADR-0045).
 *
 * Mock apps are code, not media, so they are not on the asset host. They live in
 * the web app's `public/mock-apps/` and are served same-origin there; a WebView
 * has no same-origin relationship with them either way, so mobile loads them from
 * the web origin and speaks to them purely over the bridge.
 *
 * Dev builds therefore need the WEB dev server running (`npm run dev -w apps/web`,
 * port 3000), not just Metro. The host is per-platform for the same reason it is
 * in `api-url.ts`: the iOS Simulator shares the Mac's network stack, but the
 * Android emulator reaches the host at 10.0.2.2, where `localhost` is the
 * emulator itself.
 *
 * Set EXPO_PUBLIC_MOCK_APP_URL to point somewhere else — a LAN IP for a physical
 * device, or a local web dev server on another port.
 */

import { Platform } from 'react-native';

const PRODUCTION_URL = 'https://languageplayer.io/mock-apps';

const DEV_URL = Platform.select({
  ios: 'http://localhost:3000/mock-apps',
  android: 'http://10.0.2.2:3000/mock-apps', // Android emulator → host loopback
  default: 'http://localhost:3000/mock-apps',
});

export const MOCK_APP_BASE_URL: string =
  (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_MOCK_APP_URL) ||
  (__DEV__ ? DEV_URL : PRODUCTION_URL);
