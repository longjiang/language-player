/**
 * Delete the register-and-onboard test user before the test runs.
 *
 * Called by Maestro's runScript command from register-and-onboard.yaml.
 * Uses Maestro's built-in fetch() and env globals.
 * Wrapped in an async IIFE because GraalJS doesn't support top-level await.
 * Exits cleanly if Flask is unreachable or the user doesn't exist.
 */

const FLASK_URL = 'http://127.0.0.1:5001';
const TEST_EMAIL = 'e2e.register.test@zerotohero.ca';

(async () => {
  try {
    const response = await fetch(`${FLASK_URL}/auth/test-cleanup`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL }),
    });
    const data = await response.json();
    console.log(`[cleanup] ${TEST_EMAIL}: deleted=${data.deleted}, reason=${data.reason || 'ok'}`);
  } catch (e) {
    console.log(`[cleanup] Flask unreachable (${e.message}), skipping`);
  }
})();
