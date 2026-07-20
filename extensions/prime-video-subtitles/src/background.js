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

const BADGE_COLOR = "#22c55e"; // green
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

// Listen for messages from popup and content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "clearSubtitles") {
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
        fetch(request.url)
            .then(r => r.text())
            .then(text => sendResponse({ text }))
            .catch(err => sendResponse({ text: '', error: err.message }));
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
  chrome.action.setBadgeTextColor({ color: '#ffffff' });
  chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
}

/** Per-tab badge (for YouTube where subs aren't detected via webRequest) */
function updateBadgeForTab(tabId, found) {
  if (!tabId) return;
  chrome.action.setBadgeText({ text: found ? BADGE_CHECK : '', tabId });
  chrome.action.setBadgeTextColor({ color: '#ffffff', tabId });
  chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR, tabId });
}

function clearDetectedSubtitlesByTab(tabId) {
    detectedSubtitles = detectedSubtitles.filter(sub => sub.tabId !== tabId);
    updateBadge();
}
