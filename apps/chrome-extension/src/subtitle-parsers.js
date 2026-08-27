/**
 * Subtitle parsers — self-contained parsing utilities.
 * No shared state, no platform dependencies.
 *
 * Entity decoding is provided by the shared @langplayer/utils
 * `decodeHtmlEntities` so the extension, web, and mobile all resolve HTML
 * entities (including YouTube's double-encoded ones) identically and DRY.
 */

import { decodeHtmlEntities } from '@langplayer/utils';
import { logwarn } from './i18n';

// Bounded diagnostic: confirm whether subtitle sources ship DOUBLE-encoded
// entities (e.g. `&amp;#39;`) that a single decode pass leaves as `&#39;`.
// Logs at most a few examples so the console stays quiet during playback.
const _doubleEncodedSamples = [];
const DOUBLE_ENCODED_LOG_LIMIT = 3;

/** Parse a TTML time string like "00:01:23.456" or "1.5s" to seconds */
export function parseTimeToSeconds(timeStr) {
  if (!timeStr) return 0;

  const hmsMatch = timeStr.match(/^(\d{1,}):(\d{2}):(\d{2})[.,](\d{1,3})$/);
  if (hmsMatch) {
    const h = parseInt(hmsMatch[1], 10);
    const m = parseInt(hmsMatch[2], 10);
    const s = parseInt(hmsMatch[3], 10);
    let ms = hmsMatch[4];
    while (ms.length < 3) ms += '0';
    return h * 3600 + m * 60 + s + parseInt(ms, 10) / 1000;
  }

  const msMatch = timeStr.match(/^(\d{1,}):(\d{2})[.,](\d{1,3})$/);
  if (msMatch) {
    const m = parseInt(msMatch[1], 10);
    const s = parseInt(msMatch[2], 10);
    let ms = msMatch[3];
    while (ms.length < 3) ms += '0';
    return m * 60 + s + parseInt(ms, 10) / 1000;
  }

  const unitMatch = timeStr.match(/^([\d.]+)(s|ms|h|m)$/);
  if (unitMatch) {
    const val = parseFloat(unitMatch[1]);
    const unit = unitMatch[2];
    if (unit === 'h') return val * 3600;
    if (unit === 'm') return val * 60;
    if (unit === 'ms') return val / 1000;
    return val;
  }

  const num = parseFloat(timeStr);
  return isNaN(num) ? 0 : num;
}

/** TTML parameter namespace used for ttp:tickRate / frameRate attributes. */
const TTML_NS = 'http://www.w3.org/ns/ttml';
const TTML_PARAM_NS = 'http://www.w3.org/ns/ttml#parameter';

/** Read TTML timing parameters (tickRate, frameRate, presentationTimeOffset). */
function getTTMLTimeParams(doc) {
  const tt =
    doc.getElementsByTagNameNS(TTML_NS, 'tt')[0] ||
    doc.querySelector('tt') ||
    doc.documentElement;

  const getAttr = (name) =>
    tt?.getAttributeNS(TTML_PARAM_NS, name) ||
    tt?.getAttribute(`ttp:${name}`) ||
    tt?.getAttribute(name) ||
    '';

  const tickRate = parseInt(getAttr('tickRate') || '10000000', 10) || 10000000;
  const frameRate = parseFloat(getAttr('frameRate') || '30') || 30;
  const frameRateMultiplierRaw = getAttr('frameRateMultiplier');
  let frameRateMultiplier = 1;
  if (frameRateMultiplierRaw) {
    const parts = frameRateMultiplierRaw.trim().split(/\s+/).map(Number);
    if (parts.length === 2 && parts[0] && parts[1]) {
      frameRateMultiplier = parts[0] / parts[1];
    }
  }
  const resolvedFrameRate = frameRate * frameRateMultiplier;
  const baseParams = { tickRate, frameRate: resolvedFrameRate };

  return {
    tt,
    tickRate,
    frameRate: resolvedFrameRate,
    presentationTimeOffset: parseTTMLTime(getAttr('presentationTimeOffset') || '0', baseParams),
  };
}

/** Parse a TTML time expression to seconds.
 *  Handles clock time, frames, units (s/ms/f/t), and bare tick counts —
 *  e.g. Netflix imsc1.1 uses bare ticks at 10MHz: 120120000 → 12.012s. */
function parseTTMLTime(timeStr, params) {
  if (!timeStr) return 0;
  const tickRate = params?.tickRate || 10000000;
  const frameRate = params?.frameRate || 30;
  const normalized = timeStr.replace(',', '.');

  const hms = normalized.match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/);
  if (hms) return +hms[1] * 3600 + +hms[2] * 60 + +hms[3];

  const ms = normalized.match(/^(\d+):(\d{2}(?:\.\d+)?)$/);
  if (ms) return +ms[1] * 60 + +ms[2];

  const frames = normalized.match(/^(\d+):(\d{2}):(\d{2}):(\d+)$/);
  if (frames) {
    return +frames[1] * 3600 + +frames[2] * 60 + +frames[3] + +frames[4] / frameRate;
  }

  const unit = normalized.match(/^(\d+(?:\.\d+)?)(h|m|s|ms|f|t)$/i);
  if (unit) {
    const value = parseFloat(unit[1]);
    const u = unit[2].toLowerCase();
    if (u === 'h') return value * 3600;
    if (u === 'm') return value * 60;
    if (u === 's') return value;
    if (u === 'ms') return value / 1000;
    if (u === 'f') return value / frameRate;
    if (u === 't') return value / tickRate;
  }

  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num / tickRate;
}

/** Sum begin offsets from ancestor div/body elements (TTML region timing). */
function getTTMLContainerOffset(el, params) {
  let offset = 0;
  let curr = el.parentElement;
  while (curr && curr !== params.tt) {
    const begin = curr.getAttribute('begin');
    if (begin) offset += parseTTMLTime(begin, params);
    curr = curr.parentElement;
  }
  return offset;
}

export function stripTags(text) {
  if (!text) return '';
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|section)[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function decodeEntities(text) {
  // Delegate to the shared, cross-platform decoder. It handles both
  // single-encoded (`&#39;`) and double-encoded (`&amp;#39;`) entities, so
  // YouTube timedtext captions that ship double-encoded apostrophes no longer
  // show as the literal `&#39;`.
  const decoded = decodeHtmlEntities(text);

  // Diagnostic: if the raw text contained a double-encoded entity — an
  // ampersand-entity whose expansion is itself an entity (e.g. `&amp;#39;`),
  // which is exactly what leaves `&#39;` visible — record a bounded sample for
  // `[LP Extension]` debugging. This is silent unless LOG_LEVEL=3.
  const hadDoubleEncoded = /&amp;(?:#\d+|#x[0-9a-f]+|[a-zA-Z][a-zA-Z0-9]*);/.test(text);
  if (hadDoubleEncoded && _doubleEncodedSamples.length < DOUBLE_ENCODED_LOG_LIMIT) {
    _doubleEncodedSamples.push(text.slice(0, 80));
    logwarn('subtitle text contained a double-encoded entity — decoded to', JSON.stringify(decoded.slice(0, 80)));
  }
  return decoded;
}

export function parseTTML(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    const htmlDoc = parser.parseFromString(xmlText, 'text/html');
    return extractCuesFromDoc(htmlDoc);
  }
  return extractCuesFromDoc(doc);
}

export function parseWebVTTLike(text) {
  const cues = [];
  const lines = text.split(/\r?\n/);
  let i = 0;
  if (lines[0]?.trim() === 'WEBVTT') i = 1;

  while (i < lines.length) {
    while (i < lines.length && (lines[i].trim() === '' || /^\d+$/.test(lines[i].trim()))) {
      i++;
    }
    if (i >= lines.length) break;
    const timeMatch = lines[i]?.match(/^([\d:.,]+)\s*-->\s*([\d:.,]+)/);
    if (timeMatch) {
      const start = parseTimeToSeconds(timeMatch[1]);
      const end = parseTimeToSeconds(timeMatch[2]);
      i++;
      const textLines = [];
      while (i < lines.length && lines[i].trim() !== '') {
        textLines.push(lines[i].trim());
        i++;
      }
      const text = textLines.join('\n');
      if (text) {
        cues.push({ start, end, text: decodeEntities(stripTags(text)) });
      }
    } else {
      i++;
    }
  }
  return cues;
}

export function parseSRT(text) {
  return parseWebVTTLike(text);
}

/** Parse YouTube timedtext XML into cues */
export function parseYTTimedText(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const cues = [];

  const textEls = doc.querySelectorAll('text');
  for (const el of textEls) {
    const start = parseFloat(el.getAttribute('start') || '0');
    const dur = parseFloat(el.getAttribute('dur') || '0');
    const text = stripTags(el.innerHTML || el.textContent || '');
    if (text && dur > 0) {
      cues.push({
        start,
        end: start + dur,
        text: decodeEntities(text),
      });
    }
  }

  cues.sort((a, b) => a.start - b.start);
  return cues;
}

/** Parse YouTube JSON3 timedtext format */
export function parseYTJSON3(jsonText) {
  const data = JSON.parse(jsonText);
  const cues = [];
  const events = data?.events || [];

  for (const ev of events) {
    const start = (ev.tStartMs || 0) / 1000;
    const dur = (ev.dDurationMs || 0) / 1000;
    const segs = ev.segs || [];
    const text = segs.map(s => s.utf8 || '').join('').trim();
    if (text && dur > 0) {
      // Reconstruct word-level timings (absolute seconds). The first word's
      // start / last word's end bound the spoken line more precisely than the
      // raw event window, which for auto-generated (ASR) captions includes
      // leading/trailing recognition silence. Non-ASR tracks leave these
      // untouched, and the field is stripped before cues reach the panel.
      const words = segs
        .map((s) => {
          const segText = s.utf8 || '';
          if (!segText) return null;
          const segStart = (ev.tStartMs || 0) + (s.tOffsetMs || 0);
          return {
            text: segText,
            start: segStart / 1000,
            end: (segStart + (s.dDurationMs || 0)) / 1000,
          };
        })
        .filter(Boolean);
      cues.push({ start, end: start + dur, text: decodeEntities(stripTags(text)), words });
    }
  }

  cues.sort((a, b) => a.start - b.start);
  return cues;
}

/** Heuristic: detect language from the subtitle text content */
export function tryDetectL2FromCues(cues, setDetectedL2) {
  if (cues.length === 0) return;
  const sample = cues.slice(0, 5).map(c => c.text).join(' ');
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(sample)) { setDetectedL2('ja'); return; }
  if (/[\u4e00-\u9fff]/.test(sample)) { setDetectedL2('zh'); return; }
  if (/[\uac00-\ud7af]/.test(sample)) { setDetectedL2('ko'); return; }
  if (/[\u0e00-\u0e7f]/.test(sample)) { setDetectedL2('th'); return; }
  if (/[\u0600-\u06ff]/.test(sample)) { setDetectedL2('ar'); return; }
}

// ── Internal helpers ──────────────────────────────────────────────────────

function extractCuesFromDoc(doc) {
  const cues = [];
  const params = getTTMLTimeParams(doc);
  const paragraphs = doc.querySelectorAll('p');
  for (const p of paragraphs) {
    const begin = p.getAttribute('begin') || p.getAttribute('start') || '';
    const end = p.getAttribute('end') || p.getAttribute('dur') || '';
    const text = stripTags(p.innerHTML || p.textContent || '');
    if (text && begin) {
      const containerOffset = getTTMLContainerOffset(p, params);
      const startTime = parseTTMLTime(begin, params) + containerOffset - params.presentationTimeOffset;
      let endTime = end ? parseTTMLTime(end, params) + containerOffset - params.presentationTimeOffset : null;
      if (p.getAttribute('dur') && !p.getAttribute('end')) {
        endTime = startTime + parseTTMLTime(p.getAttribute('dur'), params);
      }
      cues.push({
        start: startTime,
        end: endTime || startTime + 5,
        text: decodeEntities(text),
      });
    }
  }

  if (cues.length === 0) {
    const vttCues = parseWebVTTLike(doc.body?.textContent || '');
    cues.push(...vttCues);
  }

  cues.sort((a, b) => a.start - b.start);
  for (let i = 0; i < cues.length - 1; i++) {
    if (cues[i].end > cues[i + 1].start) {
      cues[i].end = cues[i + 1].start - 0.001;
    }
  }

  return cues;
}
