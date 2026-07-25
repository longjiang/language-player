/**
 * Python backend URL for the mobile app.
 *
 * In development, this points to the local Flask server via the host machine's IP.
 * The iOS Simulator shares the host network — localhost from the simulator
 * points to the simulator itself, not the Mac. Use the Mac's LAN IP instead.
 *
 * In production, this points to the production server.
 */

const LOCAL_DEFAULT = 'http://192.168.1.130:5001';

/** The base URL of the Python/Flask backend. */
export const PYTHON_API_URL: string =
  (typeof process !== 'undefined' && (process.env as any).EXPO_PUBLIC_API_URL) ||
  LOCAL_DEFAULT;

/** Directus 8 URL for authentication (includes /zerotohero project prefix). */
export const DIRECTUS_URL: string =
  (typeof process !== 'undefined' && (process.env as any).EXPO_PUBLIC_DIRECTUS_URL) ||
  'https://directusvps.zerotohero.ca/zerotohero';
