document.addEventListener('DOMContentLoaded', function() {
  // ── Auth ──────────────────────────────────────────────────────────────
  const STORAGE_KEY = 'lpv_auth';
  const DIRECTUS_URL = 'https://directusvps.zerotohero.ca/zerotohero';

  const authSection = document.getElementById('auth-section');
  const loggedOutDiv = document.getElementById('auth-logged-out');
  const loggedInDiv = document.getElementById('auth-logged-in');
  const authEmail = document.getElementById('auth-email');
  const authPassword = document.getElementById('auth-password');
  const authLoginBtn = document.getElementById('auth-login-btn');
  const authLogoutBtn = document.getElementById('auth-logout-btn');
  const authError = document.getElementById('auth-error');
  const authUser = document.getElementById('auth-user');

  async function checkAuth() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const auth = stored[STORAGE_KEY];
    if (auth && auth.expires > Date.now() + 5 * 60 * 1000) {
      loggedOutDiv.classList.add('hidden');
      loggedInDiv.classList.remove('hidden');
      authUser.textContent = auth.email;
    } else {
      loggedOutDiv.classList.remove('hidden');
      loggedInDiv.classList.add('hidden');
      if (auth) await chrome.storage.local.remove(STORAGE_KEY);
    }
  }

  authLoginBtn.addEventListener('click', async () => {
    const email = authEmail.value.trim();
    const password = authPassword.value;
    if (!email || !password) return;

    authLoginBtn.disabled = true;
    authError.classList.add('hidden');

    try {
      const res = await fetch(`${DIRECTUS_URL}/auth/authenticate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.errors?.[0]?.message || err.message || `Login failed (${res.status})`);
      }
      const data = await res.json();
      const token = data.data?.token;
      if (!token) throw new Error('No token in response');

      const payload = JSON.parse(atob(token.split('.')[1]));
      await chrome.storage.local.set({
        [STORAGE_KEY]: {
          token,
          email,
          userId: String(payload.id),
          expires: (payload.exp || 0) * 1000,
        }
      });
      checkAuth();
    } catch (err) {
      authError.textContent = err.message;
      authError.classList.remove('hidden');
    } finally {
      authLoginBtn.disabled = false;
    }
  });

  authLogoutBtn.addEventListener('click', async () => {
    await chrome.storage.local.remove(STORAGE_KEY);
    checkAuth();
  });

  // Allow Enter key to submit
  authPassword.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') authLoginBtn.click();
  });

  checkAuth();

  // ── Transcript Toggle ─────────────────────────────────────────────────
  const transcriptBtn = document.getElementById('transcript-btn');
  const transcriptHint = document.getElementById('transcript-hint');

  async function checkTranscriptStatus() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) { showNoTranscript(); return; }

      const res = await chrome.tabs.sendMessage(tab.id, { action: 'getTranscriptStatus' });
      if (res?.cuesCount > 0) {
        transcriptBtn.textContent = chrome.i18n.getMessage('popupShowTranscript');
        transcriptBtn.className = 'lpv-btn-available';
        transcriptBtn.disabled = false;
        transcriptBtn.onclick = () => {
          chrome.tabs.sendMessage(tab.id, { action: 'showTranscript' });
          window.close();
        };
        transcriptHint.classList.add('hidden');
      } else {
        showNoTranscript();
      }
    } catch {
      // Content script not loaded on this page
      showNoTranscript();
    }
  }

  function showNoTranscript() {
    transcriptBtn.textContent = chrome.i18n.getMessage('popupNoTranscript');
    transcriptBtn.className = 'lpv-btn-unavailable';
    transcriptBtn.disabled = true;
    transcriptHint.classList.remove('hidden');
  }

  // Check immediately and poll
  checkTranscriptStatus();
  setInterval(checkTranscriptStatus, 1500);
});
