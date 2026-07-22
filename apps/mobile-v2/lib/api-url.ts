/**
 * Python backend URL for the mobile app.
 *
 * In development, this points to the local Flask server.
 * In production, this points to the production server.
 *
 * The value is configured via app.json extra fields or expo-constants.
 */

import Constants from 'expo-constants';

const LOCAL_DEFAULT = 'http://127.0.0.1:5001';

/** The base URL of the Python/Flask backend. */
export const PYTHON_API_URL: string =
  (Constants.expoConfig?.extra?.apiUrl as string) || LOCAL_DEFAULT;

/** Directus 8 URL for authentication. */
export const DIRECTUS_URL: string =
  (Constants.expoConfig?.extra?.directusUrl as string) ||
  'https://directus.zerotohero.ca';
