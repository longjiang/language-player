/**
 * Python backend URL for the mobile app.
 *
 * Resolution order (first match wins):
 *   1. `EXPO_PUBLIC_API_URL` env var — explicit override, inlined by Metro at
 *      bundle time (babel-preset-expo replaces `process.env.EXPO_PUBLIC_*`
 *      with literals), so it works in dev and Release builds alike. Use it
 *      for physical devices (your Mac's LAN IP) and staging builds.
 *   2. Dev builds (`__DEV__`): localhost. The iOS Simulator shares the Mac's
 *      network stack, so localhost reaches the Mac's Flask server. The
 *      Android emulator uses 10.0.2.2 (maps to the host loopback).
 *   3. Release builds (App Store / Play Store): the canonical production
 *      server — never localhost.
 *
 * `__DEV__` is a React Native global inlined by Metro, so a Release archive
 * can never accidentally fall back to localhost (see SPEC-048). Only
 * `EXPO_PUBLIC_*` env vars are statically inlined; arbitrary `process.env`
 * reads are NOT available at runtime, hence the `typeof process` guard.
 */

import { Platform } from 'react-native';

const PRODUCTION_URL = 'https://pythonvps.zerotohero.ca';

const DEV_URL = Platform.select({
  ios: 'http://localhost:5001',
  android: 'http://10.0.2.2:5001', // Android emulator → host loopback
  default: 'http://localhost:5001',
});

/** The base URL of the Python/Flask backend. */
export const PYTHON_API_URL: string =
  (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_API_URL) ||
  (__DEV__ ? DEV_URL : PRODUCTION_URL);

// All backend calls go through the Flask API (SPEC-024).
// The Flask server uses DIRECTUS_TOKEN (admin token) internally.
