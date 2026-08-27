/**
 * Webpage dictionary bridge.
 *
 * The visible modal lives in an extension-origin iframe, so webpage CSS
 * cannot reach its DOM. This content script only owns the iframe lifecycle
 * and forwards lookup/follow-link events between page-content.js and the
 * isolated extension document.
 */

import { log } from './i18n';

const MESSAGE_SOURCE = 'language-player-page-dictionary';
const FRAME_ID = 'lpv-page-dictionary-frame';
const frameUrl = chrome.runtime.getURL('src/page-dictionary-frame.html');
let frame: HTMLIFrameElement | null = null;
let pendingMessage: unknown = null;

function setFrameInteractive(interactive: boolean) {
  if (!frame) return;
  frame.style.setProperty('pointer-events', interactive ? 'auto' : 'none', 'important');
  frame.style.setProperty('visibility', interactive ? 'visible' : 'hidden', 'important');
  if (interactive) {
    // Diagnose why the fixed overlay may be reflowing the host page: report the
    // computed position, and whether any ancestor has transform/filter/contain/
    // will-change (which re-anchors position:fixed to that ancestor). Fire on
    // EVERY show so it lands in the console paste.
    const cs = getComputedStyle(frame);
    let cause = 'none';
    let an = frame.parentElement;
    while (an) {
      const acs = getComputedStyle(an);
      if (acs.transform !== 'none' || acs.filter !== 'none' || acs.perspective !== 'none' || acs.contain !== 'none' || /transform/.test(acs.willChange)) {
        cause = `${an.tagName.toLowerCase()}.${(an.className && String(an.className)) || ''} [transform=${acs.transform} filter=${acs.filter} contain=${acs.contain}]`;
        break;
      }
      an = an.parentElement;
    }
    log(`[DICT] dictionary frame shown: position=${cs.position} width=${cs.width} height=${cs.height} ancestorCause=${cause}`);
  }
  log(`[DICT] dictionary frame ${interactive ? 'shown (interactive)' : 'hidden'}`);
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
  // Full-viewport, isolated overlay. Set the layout-critical properties with
  // `!important` (via setProperty) so an aggressive page reset — e.g. a global
  // `iframe { position: static !important }` on SPAs like bsky — cannot pull the
  // frame into the page flow and push the content down. The frame must always
  // overlay the viewport, never reflow the host page.
  const frameStyle: Record<string, string> = {
    position: 'fixed',
    inset: '0',
    width: '100vw',
    height: '100vh',
    border: '0',
    margin: '0',
    padding: '0',
    'z-index': '2147483647',
    background: 'transparent',
    'pointer-events': 'none',
    visibility: 'hidden',
  };
  for (const [prop, value] of Object.entries(frameStyle)) {
    frame.style.setProperty(prop, value, 'important');
  }
  frame.addEventListener('load', () => {
    if (pendingMessage) {
      sendToFrame(pendingMessage);
    }
  });
  (document.documentElement || document.body).appendChild(frame);
  // Confirm the frame truly overlays: log its computed position so we can tell a
  // page-CSS override (position != fixed) from a layout push.
  const computed = getComputedStyle(frame);
  log(`[DICT] dictionary frame attached: position=${computed.position} width=${computed.width} height=${computed.height}`);
  return frame;
}

function openLookup(lookup: unknown) {
  pendingMessage = { source: MESSAGE_SOURCE, action: 'open', lookup };
  ensureFrame();
  setFrameInteractive(true);
  sendToFrame(pendingMessage);
}

function closeLookup() {
  pendingMessage = null;
  setFrameInteractive(false);
  sendToFrame({ source: MESSAGE_SOURCE, action: 'close' });
}

function openPageModal(modal: unknown) {
  pendingMessage = { source: MESSAGE_SOURCE, action: 'open-modal', modal };
  ensureFrame();
  setFrameInteractive(true);
  sendToFrame(pendingMessage);
}

window.addEventListener('lpv-page-dictionary-open', (event) => {
  openLookup((event as CustomEvent).detail);
});

window.addEventListener('lpv-page-dictionary-close', closeLookup);

window.addEventListener('lpv-page-modal-open', (event) => {
  openPageModal((event as CustomEvent).detail);
});

window.addEventListener('message', (event) => {
  if (!frame || event.source !== frame.contentWindow) return;
  if (event.origin !== new URL(frameUrl).origin) return;
  if (!event.data || event.data.source !== MESSAGE_SOURCE) return;

  if (event.data.action === 'close') {
    closeLookup();
    return;
  }
  if (event.data.action === 'page-modal-event') {
    chrome.runtime.sendMessage({ action: 'pageModalEvent', event: event.data.event }).catch(() => {});
    closeLookup();
    return;
  }
  if (event.data.action === 'follow-link' && typeof event.data.href === 'string') {
    closeLookup();
    location.href = event.data.href;
  }
});
