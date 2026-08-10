/**
 * Centralised Python backend URL (same convention as apps/web).
 *
 * Set NEXT_PUBLIC_API_URL in your env to switch between local and production:
 *   - Local:  http://127.0.0.1:5001   (default)
 *   - Prod:   https://pythonvps.zerotohero.ca
 */

const LOCAL_DEFAULT = 'http://127.0.0.1:5001';

/** The base URL of the Python/Flask backend. */
export const PYTHON_API_URL: string =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) ||
  LOCAL_DEFAULT;
