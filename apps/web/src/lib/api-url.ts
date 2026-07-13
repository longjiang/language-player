/**
 * Centralised Python backend URL.
 *
 * Set NEXT_PUBLIC_API_URL in your env to switch between local and production:
 *   - Local:  http://127.0.0.1:5001   (default)
 *   - Prod:   https://pythonvps.zerotohero.ca
 *
 * Every component that calls the Python API should import this module
 * instead of hard-coding or reading process.env directly.
 */

const LOCAL_DEFAULT = 'http://127.0.0.1:5001';

/** The base URL of the Python/Flask backend. */
export const PYTHON_API_URL: string =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) ||
  LOCAL_DEFAULT;
