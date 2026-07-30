/**
 * Subtitle parsers — self-contained parsing utilities.
 * No shared state, no platform dependencies.
 */

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

export function stripTags(text) {
  if (!text) return '';
  return text.replace(/<[^>]*>/g, '').trim();
}

export function decodeEntities(text) {
  if (!text) return '';
  const txt = document.createElement('textarea');
  txt.innerHTML = text;
  return txt.value;
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
      const text = textLines.join(' ');
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
      cues.push({ start, end: start + dur, text: decodeEntities(stripTags(text)) });
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
  const paragraphs = doc.querySelectorAll('p');
  for (const p of paragraphs) {
    const begin = p.getAttribute('begin') || p.getAttribute('start') || '';
    const end = p.getAttribute('end') || p.getAttribute('dur') || '';
    const text = stripTags(p.innerHTML || p.textContent || '');
    if (text && begin) {
      const startTime = parseTimeToSeconds(begin);
      let endTime = end ? parseTimeToSeconds(end) : null;
      if (p.getAttribute('dur') && !p.getAttribute('end')) {
        endTime = startTime + parseTimeToSeconds(p.getAttribute('dur'));
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
