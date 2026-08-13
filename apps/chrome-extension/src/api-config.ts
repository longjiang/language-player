/**
 * Shared Flask API base for the Language Player extension.
 *
 * The extension talks only to the Flask gateway (SPEC-024 / ADR-0023), never
 * to Supabase, GoTrue, or Directus directly. This mirrors the `PYTHON_API_URL`
 * contract used by web and mobile.
 */

export const API_BASE = 'https://pythonvps.zerotohero.ca';
