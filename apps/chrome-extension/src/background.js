// Subtitle file extensions
const subtitleExtensions = [
    '.ass',
    '.cap',
    '.dfxp',
    '.dks',
    '.idx',
    '.itt',
    '.jss',
    '.lrc',
    '.mks',
    '.mpl',
    '.pjs',
    '.psb',
    '.qt.txt',
    '.qttext',
    '.rt',
    '.sbv',
    '.scc',
    '.smi',
    '.srt',
    '.ssa',
    '.stl',
    '.sub',
    '.sup',
    '.ttml',
    '.ttml2',
    '.usf',
    '.vtt',
    '.xml'
];

const BADGE_CHECK = "\u2713";  // ✓

// Keep track of detected subtitle URLs in memory
let detectedSubtitles = [];

// Listen for web requests that might be subtitle files
chrome.webRequest.onCompleted.addListener(
    (details) => {
        // Check if the URL contains a subtitle extension
        if (details.url && details.statusCode === 200 && details.tabId) {
            const url = details.url.toLowerCase();

            for (const ext of subtitleExtensions) {
                if (url.endsWith(ext)) {
                    // Store unique subtitle URLs
                    if (!detectedSubtitles.some(sub => sub.url === details.url)) {
                        const fileName = getFileNameFromUrl(details.url);
                        const extension = getExtensionFromUrl(details.url);

                        const subtitleEntry = {
                            tabId: details.tabId,
                            url: details.url,
                            fileName: fileName,
                            extension: extension,
                            timestamp: Date.now()
                        };

                        detectedSubtitles.push(subtitleEntry);

                        // Update the badge to show number of available subtitles
                        updateBadge();

                        // Forward subtitle to content script for transcript panel
                        chrome.tabs.sendMessage(details.tabId, {
                            action: 'subtitleDetected',
                            url: details.url,
                            fileName: fileName,
                            extension: extension
                        }).catch(() => {
                            // Content script may not be ready yet; that's ok
                        });

                        break;
                    }
                }
            }
        }
    },
    {urls: ["http://*/*", "https://*/*"]}
);

// Track tabs where content script is ready
const readyTabs = new Set();
const tabIdMap = {};

// ── Side panel (chrome.sidePanel) ─────────────────────────────────────────
// The side panel page (src/sidepanel.html) connects a long-lived runtime port
// on load and disconnects on close. Content scripts push panel state through
// runtime.sendMessage; we tag it with the sender's tabId and relay it over
// the port. We also tell the active tab's content script whether the side
// panel is open (gates ArrowUp/Down cue seeking and — critically — page
// tokenization: a tab must not tokenize unless the panel is genuinely open on
// it, per page-content's panelOpen + pageTranslationTabOpen lifecycle).
let sidePanelPort = null;
let sidePanelConnected = false;
/** True only while the side panel is actually open (shown) in a window. This
 *  mirrors the browser's real state via chrome.sidePanel.onOpened/onClosed and
 *  is reset synchronously on a tab switch, so a concurrent getSidePanelState
 *  from the side panel can NEVER claim the newly-activated tab (the bug where
 *  switching away from a page-translation tab tokenized the next page). */
let sidePanelOpen = false;
let sidePanelTabId = null;
let sidePanelWindowId = null;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'lpv-sidepanel') return;
  sidePanelPort = port;
  sidePanelConnected = true;
  // Tell the just-connected side panel whether the panel is open and on which
  // tab, so it can decide whether to pull/claim the active tab's state.
  try {
    port.postMessage({ action: 'sidePanelOpenState', open: sidePanelOpen, tabId: sidePanelTabId });
  } catch {}
  port.onDisconnect.addListener(() => {
    const previousTabId = sidePanelTabId;
    sidePanelPort = null;
    sidePanelConnected = false;
    // The side-panel document unloading (port end) also closes the panel. Leave
    // the tracked open state to chrome.sidePanel.onClosed, which fires reliably;
    // notify the panel's tab to restore in case onClosed didn't cover it.
    if (sidePanelOpen) {
      sidePanelOpen = false;
      sidePanelTabId = null;
      sidePanelWindowId = null;
      notifyTabPanelOpenState(previousTabId, false);
    }
  });
});

function notifyTabPanelOpenState(tabId, open) {
  if (tabId == null) return;
  chrome.tabs.sendMessage(tabId, { action: 'panelOpenState', open }).catch(() => {
    // Content script may not be ready yet; that's ok.
  });
}

/** chrome.sidePanel.onOpened/onClosed are the real open/close signal and are
 *  re-registered on MV3 service-worker wake. onOpened may omit tabId for a
 *  global panel, so fall back to the window's active tab. */
if (chrome.sidePanel?.onOpened) {
  chrome.sidePanel.onOpened.addListener(async ({ tabId, windowId }) => {
    let resolvedTabId = tabId;
    if (resolvedTabId == null) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, windowId });
        resolvedTabId = tab?.id ?? null;
      } catch {}
    }
    sidePanelOpen = true;
    sidePanelTabId = resolvedTabId;
    sidePanelWindowId = windowId;
    if (resolvedTabId != null) notifyTabPanelOpenState(resolvedTabId, true);
    try { sidePanelPort?.postMessage({ action: 'sidePanelOpenState', open: true, tabId: resolvedTabId }); } catch {}
  });
}
if (chrome.sidePanel?.onClosed) {
  chrome.sidePanel.onClosed.addListener(() => {
    const previousTabId = sidePanelTabId;
    sidePanelOpen = false;
    sidePanelTabId = null;
    sidePanelWindowId = null;
    if (previousTabId != null) notifyTabPanelOpenState(previousTabId, false);
    try { sidePanelPort?.postMessage({ action: 'sidePanelOpenState', open: false }); } catch {}
  });
}

/** Close the open side panel if any. onClosed performs the final state reset. */
function closeSidePanelIfOpen() {
  if (!sidePanelOpen || sidePanelWindowId == null) return;
  try {
    chrome.sidePanel.close({ windowId: sidePanelWindowId }).catch(() => {});
  } catch {}
}

// The extension action toggles the side panel natively (open when closed, close
// when open) via Chrome's openPanelOnActionClick behavior. This is reliable
// where our own sidePanelConnected flag is not — the MV3 service worker can be
// suspended/restarted and the side-panel port does not always disconnect, both
// of which previously left a stale "open" state that made a second click fail
// to open. The action click therefore needs no manual open/close handler.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

async function toggleSidePanel(tab) {
  if (!tab?.id) return;
  try {
    if (sidePanelOpen && chrome.sidePanel?.close) {
      // The manifest uses one global side panel. Closing by windowId works
      // across Chrome versions where close({ tabId }) rejects for a global
      // panel. This path is used by the keyboard commands (Alt+T etc.).
      console.log('[LP Extension] Toggle → closing side panel');
      const prevTabId = sidePanelTabId;
      const prevWindowId = sidePanelWindowId ?? tab.windowId;
      // Mark closed synchronously so a concurrent toggle/query sees it closed.
      sidePanelOpen = false;
      sidePanelTabId = null;
      sidePanelWindowId = null;
      notifyTabPanelOpenState(prevTabId, false);
      try { sidePanelPort?.postMessage({ action: 'sidePanelOpenState', open: false }); } catch {}
      await chrome.sidePanel.close({ windowId: prevWindowId });
    } else {
      console.log('[LP Extension] Toggle → opening side panel');
      sidePanelOpen = true;
      sidePanelTabId = tab.id;
      sidePanelWindowId = tab.windowId;
      await chrome.sidePanel.open({ tabId: tab.id });
      // onOpened also fires and notifies; a direct notify here covers the case
      // where the service worker is woken fresh (onOpened listener already
      // registered on wake) so the tab restores promptly.
      notifyTabPanelOpenState(tab.id, true);
    }
  } catch {}
}

// The extension icon toggles the side panel natively via
// chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }) above —
// clicking it opens a closed panel and closes an open one, with no manual
// open/close handler needed.

// The native side panel is global to a window. Close it when the user changes
// tabs so opening the panel on one reading page never affects other tabs.
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  if (!sidePanelOpen) return;
  if (tabId === sidePanelTabId) return;
  const previousTabId = sidePanelTabId;
  const panelWindowId = sidePanelWindowId ?? windowId;
  // Reset synchronously BEFORE closing so a concurrent getSidePanelState (from
  // the side panel's active-tab effect) never claims the new tab. The actual
  // close fires chrome.sidePanel.onClosed for the final teardown.
  sidePanelOpen = false;
  sidePanelTabId = null;
  sidePanelWindowId = null;
  notifyTabPanelOpenState(previousTabId, false);
  try { sidePanelPort?.postMessage({ action: 'sidePanelOpenState', open: false }); } catch {}
  chrome.sidePanel.close({ windowId: panelWindowId }).catch(() => {});
});

// Alt+T / Ctrl+Shift+Y — registered in manifest "commands".
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-panel' && command !== 'toggle-panel-alt') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await toggleSidePanel(tab);
});

// Listen for messages from popup and content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "panelState" || request.action === "pageModeState" || request.action === "pageLookup" || request.action === "pageModalEvent") {
        // Content script → side panel relay (tagged with the sender tab).
        if (sidePanelPort && sender.tab?.id) {
            try {
                sidePanelPort.postMessage({ ...request, tabId: sender.tab.id });
            } catch {}
        } else {
            console.log('[LP Extension] [BG] relay SKIPPED', request.action, { hasPort: !!sidePanelPort, senderTabId: sender.tab?.id });
        }
        sendResponse({ ok: true });
        return true;
    } else if (request.action === "closePanel") {
        // Video change (e.g. YouTube SPA navigation to another video): close
        // the side panel so a left-running autoplay doesn't keep the panel
        // consuming tokenization / translation / subscription calls.
        closeSidePanelIfOpen();
        sendResponse({ ok: true });
        return true;
    } else if (request.action === "clearSubtitles") {
        detectedSubtitles = [];
        updateBadge();
        sendResponse({success: true});
    } else if (request.action === "removeSubtitle") {
        detectedSubtitles = detectedSubtitles.filter(sub => sub.url !== request.url);
        updateBadge();
        sendResponse({success: true});
    } else if (request.action === "getSubtitles") {
        sendResponse({subtitles: detectedSubtitles});
    } else if (request.action === "contentScriptReady") {
        if (sender.tab) {
            readyTabs.add(sender.tab.id);
            // Store the tab ID so the content script can retrieve it
            tabIdMap[sender.tab.id] = sender.tab.id;
        }
        sendResponse({ tabId: sender.tab?.id });
    } else if (request.action === "getTabId") {
        sendResponse(sender.tab?.id || null);
    } else if (request.action === "getSidePanelState") {
        // The side panel asks whether the panel is currently open and on which
        // tab, before it claims page-translation/subtitles mode on the active
        // tab. On a tab switch the background resets this synchronously, so a
        // stale side panel can never tokenize a tab the panel isn't on.
        sendResponse({ open: sidePanelOpen, tabId: sidePanelTabId });
    } else if (request.action === "loadSubtitlesInTab") {
        // Popup wants to load a specific subtitle in the active tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'loadSubtitles',
                    url: request.url,
                    fileName: request.fileName
                }).catch(() => {});
            }
        });
        sendResponse({success: true});
    } else if (request.action === "setBadge") {
        updateBadgeForTab(sender.tab?.id, request.found);
        sendResponse({success: true});
    } else if (request.action === "bgFetch") {
        const { url, method = 'GET', headers = {}, body } = request;
        fetch(url, { method, headers, body })
            .then(async (r) => {
                const text = await r.text();
                sendResponse({ ok: r.ok, status: r.status, text });
            })
            .catch(err => sendResponse({ ok: false, status: 0, text: '', error: err.message }));
        return true; // async
    } else if (request.action === "mainWorldFetch") {
        const tabId = sender.tab?.id;
        if (!tabId) { sendResponse({ text: '' }); return; }
        chrome.scripting.executeScript({
            target: { tabId },
            func: (url) => {
                return new Promise((res) => {
                    const x = new XMLHttpRequest();
                    x.open('GET', url, true);
                    x.timeout = 10000;
                    x.onload = () => res(x.responseText || '');
                    x.onerror = () => res('');
                    x.ontimeout = () => res('');
                    x.send();
                });
            },
            args: [request.url],
            world: 'MAIN',
        }).then(results => {
            sendResponse({ text: results?.[0]?.result || '' });
        }).catch(err => {
            sendResponse({ text: '', error: err?.message });
        });
        return true; // async
    } else if (request.action === "setupNetflixInterceptor") {
        // Inject JSON.parse monkeypatch into Netflix's MAIN world.
        // Content scripts can't do this because they run in an isolated world,
        // and DOM <script> injection is blocked by Netflix's CSP.
        const tabId = sender.tab?.id;
        if (!tabId) { sendResponse({ success: false, error: 'No tab' }); return; }
        chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                if (window.__lpvNetflixActive) return;
                window.__lpvNetflixActive = true;

                const originalParse = JSON.parse;
                let netflixSubsLoaded = false;

                JSON.parse = function(text) {
                    const data = originalParse(text);

                    if (!netflixSubsLoaded && data && data.result) {
                        const tracks = data.result.timedtexttracks
                            || data.result.textTracks
                            || data.result.timedTextTracks
                            || data.result.subtitleTracks
                            || data.result.ttTracks;

                        if (tracks && tracks.length > 0) {
                            netflixSubsLoaded = true;

                            const trackList = [];
                            for (let i = 0; i < tracks.length; i++) {
                                const t = tracks[i];
                                if (t.isNoneTrack) continue;

                                const dl = t.ttDownloadables || t.downloadables || {};
                                let url = '';
                                let fmt = '';
                                const formats = ['webvtt-lssdh-ios8', 'dfxp-ls-sdh', 'imsc1.1', 'simplesdh'];
                                for (let j = 0; j < formats.length; j++) {
                                    const d = dl[formats[j]];
                                    if (d) {
                                        const urls = d.downloadUrls || (d.urls ? d.urls.map(function(u) { return u.url; }) : []);
                                        if (urls.length > 0) {
                                            url = typeof urls[0] === 'string' ? urls[0] : Object.values(urls)[0];
                                            fmt = formats[j];
                                            break;
                                        }
                                    }
                                }

                                if (url) {
                                    trackList.push({
                                        language: t.language || t.languageCode || '',
                                        languageCode: t.language || t.languageCode || '',
                                        trackType: t.trackType || '',
                                        isNoneTrack: !!t.isNoneTrack,
                                        url: url,
                                        format: fmt,
                                    });
                                }
                            }

                            // Restore original JSON.parse IMMEDIATELY to avoid
                            // the wrapper overhead on every subsequent call.
                            // Netflix makes hundreds of JSON.parse calls during
                            // playback — the wrapper adds up and causes tab slowdown.
                            JSON.parse = originalParse;

                            window.postMessage({
                                source: 'lpv-netflix',
                                type: 'netflixTracks',
                                tracks: trackList,
                            }, '*');

                            console.log('[LP Extension] MAIN: intercepted ' + trackList.length + ' Netflix tracks, JSON.parse restored');
                        }
                    }

                    return data;
                };

                console.log('[LP Extension] MAIN: JSON.parse monkeypatch active');
            },
            world: 'MAIN',
        }).then(() => {
            sendResponse({ success: true });
        }).catch(err => {
            sendResponse({ success: false, error: err?.message });
        });
        return true; // async
    } else if (request.action === "netflixSeek") {
        // Seek the Netflix player using the exact approach from Language Reactor v5.1.8.
        // We access api.videoPlayer first, then call session/player methods on it.
        const tabId = sender.tab?.id;
        if (!tabId) { sendResponse({ success: false, error: 'No tab' }); return; }
        chrome.scripting.executeScript({
            target: { tabId },
            func: (timeSec) => {
                try {
                    // Language Reactor pattern: access .videoPlayer on the API object
                    const api = window.netflix?.appContext?.state?.playerApp?.getAPI?.();
                    if (!api?.videoPlayer) return 'no-api';

                    const vp = api.videoPlayer;
                    const sessions = vp.getAllPlayerSessionIds?.();
                    if (!sessions) return 'no-sessions';

                    // Filter for "watch" sessions (Netflix uses "watch-<id>" format)
                    const watch = sessions.filter(s => s.startsWith('watch'));
                    if (!watch[0]) return 'no-watch-session';

                    const player = vp.getVideoPlayerBySessionId?.(watch[0]);
                    if (!player?.seek) return 'no-seek-method';

                    // Netflix player seek expects milliseconds
                    player.seek(timeSec * 1000);
                    return 'netflix-videoplayer-seek';
                } catch (e) {
                    return 'error: ' + e.message;
                }
            },
            args: [request.timeSec],
            world: 'MAIN',
        }).then(results => {
            sendResponse({ success: true, method: results?.[0]?.result });
        }).catch(err => {
            sendResponse({ success: false, error: err?.message });
        });
        return true; // async
    } else if (request.action === "netflixProbeActiveTrack") {
        // Probe <video>.textTracks in MAIN world to find the active subtitle language.
        const tabId = sender.tab?.id;
        if (!tabId) { sendResponse({ language: null }); return; }
        chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                try {
                    const video = document.querySelector('video');
                    if (!video || !video.textTracks) return null;
                    for (let i = 0; i < video.textTracks.length; i++) {
                        const track = video.textTracks[i];
                        // Netflix sets mode='showing' on the active subtitle track
                        if (track.mode === 'showing' && track.language) {
                            return track.language;
                        }
                    }
                    // Fallback: check for 'hidden' tracks (some Netflix versions)
                    for (let i = 0; i < video.textTracks.length; i++) {
                        const track = video.textTracks[i];
                        if (track.kind === 'subtitles' && track.language) {
                            return track.language;
                        }
                    }
                } catch (e) {}
                return null;
            },
            world: 'MAIN',
        }).then(results => {
            sendResponse({ language: results?.[0]?.result || null });
        }).catch(() => {
            sendResponse({ language: null });
        });
        return true; // async
    } else if (request.action === "netflixGetPlayerTime") {
        // Netflix's player API reports the media/content timeline, which can
        // differ from <video>.currentTime when ad breaks shift the element.
        const tabId = sender.tab?.id;
        if (!tabId) { sendResponse({ playerTime: null }); return; }
        chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                try {
                    const api = window.netflix?.appContext?.state?.playerApp?.getAPI?.();
                    const vp = api?.videoPlayer;
                    const sessions = vp?.getAllPlayerSessionIds?.();
                    if (!sessions) return null;
                    const watch = sessions.filter(s => s.startsWith('watch'));
                    const player = vp?.getVideoPlayerBySessionId?.(watch[0]);
                    const ms = player?.getCurrentTime?.();
                    return typeof ms === 'number' && isFinite(ms) ? ms / 1000 : null;
                } catch (_) {
                    return null;
                }
            },
            world: 'MAIN',
        }).then(results => {
            sendResponse({ playerTime: results?.[0]?.result ?? null });
        }).catch(() => {
            sendResponse({ playerTime: null });
        });
        return true; // async
    }
    return true; // Keep message channel open for async response
});

// Clear detected subtitles when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    clearDetectedSubtitlesByTab(tabId);
    updateBadge();
});

// Clear detected subtitles when a tab is refreshed
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') {
        clearDetectedSubtitlesByTab(tabId);
        updateBadge();
        // Close the side panel on page navigation. The panel's port stays
        // connected across a reload, so leaving it open would keep firing
        // tokenization / translation / subscription calls on a page the
        // learner has navigated away from (e.g. autoplay). Reopening is a
        // deliberate user action (icon / shortcut / token click).
        if (sidePanelOpen && tabId === sidePanelTabId) {
            closeSidePanelIfOpen();
        }
    }
});

// Extract filename from URL
function getFileNameFromUrl(url) {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const segments = pathname.split('/');
        const lastSegment = segments[segments.length - 1];

        // Return the filename or a default if empty
        return decodeURIComponent(lastSegment) || "subtitle";
    } catch (e) {
        return "subtitle";
    }
}

// Extract extension from URL
function getExtensionFromUrl(url) {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname.toLowerCase();

        for (const ext of subtitleExtensions) {
            if (pathname.endsWith(ext)) {
                return ext;
            }
        }
        return "";
    } catch (e) {
        return "";
    }
}

// Update badge with checkmark when subtitles are available
function updateBadge() {
  const found = detectedSubtitles.length > 0;
  chrome.action.setBadgeText({ text: found ? BADGE_CHECK : '' });
}

/** Per-tab badge (for YouTube where subs aren't detected via webRequest) */
function updateBadgeForTab(tabId, found) {
  if (!tabId) return;
  chrome.action.setBadgeText({ text: found ? BADGE_CHECK : '', tabId });
}

function clearDetectedSubtitlesByTab(tabId) {
    detectedSubtitles = detectedSubtitles.filter(sub => sub.tabId !== tabId);
    updateBadge();
}
