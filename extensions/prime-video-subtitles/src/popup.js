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
      const res = await fetch(`${DIRECTUS_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.errors?.[0]?.message || `Login failed (${res.status})`);
      }
      const data = await res.json();
      const token = data.data?.access_token;
      if (!token) throw new Error('No access token');

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

  // ── Subtitles ─────────────────────────────────────────────────────────
  const subtitlesList = document.getElementById('subtitles-list');
  const noSubtitlesMessage = document.getElementById('no-subtitles');
  const clearBtn = document.getElementById('clear-btn');
  const downloadAllBtn = document.getElementById('download-all-btn');
  let currentSubtitles = [];

  // Load subtitles from background script memory
  function loadSubtitles() {
    chrome.runtime.sendMessage({ action: "getSubtitles" }, function(response) {
      const subtitles = response.subtitles || [];
      currentSubtitles = subtitles;

      if (subtitles.length === 0) {
        subtitlesList.innerHTML = '';
        noSubtitlesMessage.classList.remove('hidden');
        downloadAllBtn.classList.add('hidden');
      } else {
        noSubtitlesMessage.classList.add('hidden');
        downloadAllBtn.classList.toggle('hidden', subtitles.length < 2);
        renderSubtitlesList(subtitles);
      }
    });
  }

  // Render the list of subtitles
  function renderSubtitlesList(subtitles) {
    // Sort by most recent first
    subtitles.sort((a, b) => b.timestamp - a.timestamp);

    subtitlesList.innerHTML = '';

    subtitles.forEach(subtitle => {
      const item = document.createElement('div');
      item.className = 'subtitle-item';

      const info = document.createElement('div');
      info.className = 'subtitle-info';

      const name = document.createElement('div');
      name.className = 'subtitle-name';
      const maxNameLength = 40;
      const fullName = subtitle.fileName;
      const truncated = fullName.length > maxNameLength;
      name.textContent = truncated ? fullName.slice(0, maxNameLength) + '...' : fullName;
      if (truncated) item.title = fullName;

      const ext = document.createElement('div');
      ext.className = 'subtitle-also';
      ext.textContent = new Date(subtitle.timestamp).toLocaleString();

      info.appendChild(name);
      info.appendChild(ext);

      const downloadBtn = document.createElement('button');
      downloadBtn.className = 'download-btn';
      downloadBtn.textContent = 'Download';
      downloadBtn.title = fullName;
      downloadBtn.addEventListener('click', () => downloadSubtitle(subtitle));

      const viewBtn = document.createElement('button');
      viewBtn.className = 'view-btn';
      viewBtn.textContent = 'View';
      viewBtn.title = 'Show transcript in panel';
      viewBtn.addEventListener('click', () => viewInPanel(subtitle));

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.textContent = '×';
      removeBtn.title = 'Remove';
      removeBtn.addEventListener('click', () => removeSubtitle(subtitle.url));

      item.appendChild(info);
      item.appendChild(viewBtn);
      item.appendChild(downloadBtn);
      item.appendChild(removeBtn);
      subtitlesList.appendChild(item);
    });
  }

  function downloadSubtitle(subtitle) {
    chrome.downloads.download({
      url: subtitle.url,
      filename: subtitle.fileName
    });
  }

  function viewInPanel(subtitle) {
    chrome.runtime.sendMessage({
      action: "loadSubtitlesInTab",
      url: subtitle.url,
      fileName: subtitle.fileName
    });
    // Close popup after sending
    window.close();
  }

  function removeSubtitle(url) {
    chrome.runtime.sendMessage({ action: "removeSubtitle", url: url }, function(response) {
      if (response && response.success) {
        loadSubtitles();
      }
    });
  }

  downloadAllBtn.addEventListener('click', function() {
    currentSubtitles.forEach(downloadSubtitle);
  });

  // Clear all subtitles
  clearBtn.addEventListener('click', function() {
    chrome.runtime.sendMessage({ action: "clearSubtitles" }, function(response) {
      if (response.success) {
        loadSubtitles();
      }
    });
  });

  // Initial load
  loadSubtitles();

  // Poll for updates regularly
  setInterval(loadSubtitles, 1000);
});
