/**
 * Webpage dictionary bridge.
 *
 * The visible modal lives in an extension-origin iframe, so webpage CSS
 * cannot reach its DOM. This content script only owns the iframe lifecycle
 * and forwards lookup/follow-link events between page-content.js and the
 * isolated extension document.
 */

const MESSAGE_SOURCE = 'language-player-page-dictionary';
const FRAME_ID = 'lpv-page-dictionary-frame';
const frameUrl = chrome.runtime.getURL('src/page-dictionary-frame.html');
let frame: HTMLIFrameElement | null = null;
let pendingLookup: unknown = null;

function setFrameInteractive(interactive: boolean) {
  if (!frame) return;
  frame.style.setProperty('pointer-events', interactive ? 'auto' : 'none', 'important');
  frame.style.setProperty('visibility', interactive ? 'visible' : 'hidden', 'important');
}

function sendToFrame(message: unknown) {
  if (!frame?.contentWindow) return;
  frame.contentWindow.postMessage(message, new URL(frameUrl).origin);
}

function ensureFrame() {
  if (frame) return frame;
  frame = document.createElement('iframe');
  frame.id = FRAME_ID;
  frame.title = 'Language Player dictionary';
  frame.src = frameUrl;
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = [
    'position:fixed',
    'inset:0',
    'width:100vw',
    'height:100vh',
    'border:0',
    'margin:0',
    'padding:0',
    'z-index:2147483647',
    'background:transparent',
    'pointer-events:none',
    'visibility:hidden',
  ].join(';');
  frame.addEventListener('load', () => {
    if (pendingLookup) {
      sendToFrame({ source: MESSAGE_SOURCE, action: 'open', lookup: pendingLookup });
    }
  });
  (document.documentElement || document.body).appendChild(frame);
  return frame;
}

function openLookup(lookup: unknown) {
  pendingLookup = lookup;
  ensureFrame();
  setFrameInteractive(true);
  sendToFrame({ source: MESSAGE_SOURCE, action: 'open', lookup });
}

function closeLookup() {
  pendingLookup = null;
  setFrameInteractive(false);
  sendToFrame({ source: MESSAGE_SOURCE, action: 'close' });
}

window.addEventListener('lpv-page-dictionary-open', (event) => {
  openLookup((event as CustomEvent).detail);
});

window.addEventListener('lpv-page-dictionary-close', closeLookup);

window.addEventListener('message', (event) => {
  if (!frame || event.source !== frame.contentWindow) return;
  if (event.origin !== new URL(frameUrl).origin) return;
  if (!event.data || event.data.source !== MESSAGE_SOURCE) return;

  if (event.data.action === 'close') {
    closeLookup();
    return;
  }
  if (event.data.action === 'follow-link' && typeof event.data.href === 'string') {
    closeLookup();
    location.href = event.data.href;
  }
});
