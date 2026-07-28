/**
 * Delete the register-and-onboard test user before the test runs.
 *
 * Called by Maestro's runScript command from register-and-onboard.yaml.
 * Uses Maestro's built-in fetch() and env globals.
 * Exits cleanly (doesn't throw) if Flask is unreachable or the user
 * doesn't exist, so the test always continues regardless of cleanup result.
 */

const FLASK_URL = env.FLASK_URL || 'http://127.0.0.1:5001';
const TEST_EMAIL = env.TEST_EMAIL || 'e2e.register.test@zerotohero.ca';

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
  // Don't throw — test should continue even if Flask is down
}
