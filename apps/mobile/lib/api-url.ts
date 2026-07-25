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

const LOCAL_DEFAULT = 'http://Jons-M1-Mac-mini.local:5001';

/** The base URL of the Python/Flask backend. */
export const PYTHON_API_URL: string =
  (typeof process !== 'undefined' && (process.env as any).EXPO_PUBLIC_API_URL) ||
  LOCAL_DEFAULT;

/** Directus 8 URL for authentication (includes /zerotohero project prefix). */
export const DIRECTUS_URL: string =
  (typeof process !== 'undefined' && (process.env as any).EXPO_PUBLIC_DIRECTUS_URL) ||
  'https://directusvps.zerotohero.ca/zerotohero';
