/**
 * Python backend URL for the mobile app.
 *
 * In development, this uses the Mac's Bonjour/mDNS hostname (`.local`),
 * which automatically resolves to the current LAN IP. No need to update
 * when your DHCP lease changes.
 *
 * Avoid `127.0.0.1` — the iOS Simulator has its own loopback interface,
 * so localhost points to the simulator itself, not the Mac.
 *
 * In production, this points to the production server.
 */

const LOCAL_DEFAULT = 'http://localhost:5001';

/** The base URL of the Python/Flask backend.
 *  Uses EXPO_PUBLIC_API_URL env var in production, localhost in dev.
 *  iOS Simulator shares the Mac's network stack so localhost works.
 *  For physical devices, set EXPO_PUBLIC_API_URL to your Mac's LAN IP. */
export const PYTHON_API_URL: string =
  (typeof process !== 'undefined' && (process.env as any).EXPO_PUBLIC_API_URL) ||
  LOCAL_DEFAULT;

// DIRECTUS_URL removed per SPEC-024 — all Directus calls go through Flask backend.
// The Flask server uses DIRECTUS_TOKEN (admin token) internally.
