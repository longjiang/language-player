import type { SubtitleLine } from '@langplayer/shared';

/**
 * Parse SRT subtitle text into SubtitleLine[].
 *
 * SRT format:
 *   1
 *   00:00:01,000 --> 00:00:04,000
 *   Hello world
 *
 *   2
 *   00:00:05,000 --> 00:00:08,000
 *   Second line
 */
function parseSRT(text: string): SubtitleLine[] {
  const blocks = text.trim().replace(/\r\n/g, '\n').split(/\n\n+/);
  const lines: SubtitleLine[] = [];

  for (const block of blocks) {
    const parts = block.trim().split('\n');
    if (parts.length < 2) continue;

    const timeIdx = parts.findIndex((p) => p.includes('-->'));
    if (timeIdx === -1) continue;

    // Only validate the start time — end time may be missing or NaN
    const timeMatch = parts[timeIdx]!.match(
      /(\d{2}):(\d{2}):(\d{2})[,.]\d{3}\s*-->/,
    );
    if (!timeMatch) continue;

    const hours = parseInt(timeMatch[1]!, 10);
    const minutes = parseInt(timeMatch[2]!, 10);
    const seconds = parseInt(timeMatch[3]!, 10);
    const millisPart = parts[timeIdx]!.match(/[,.](\d{3})\s*-->/);
    const millis = millisPart ? parseInt(millisPart[1]!, 10) : 0;
    const starttime = hours * 3600 + minutes * 60 + seconds + millis / 1000;

    const textLines = parts.slice(timeIdx + 1);
    const line = textLines
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .trim();

    if (line && !isNaN(starttime)) {
      lines.push({ starttime, line });
    }
  }

  return lines;
}

/**
 * Parse WebVTT subtitle text into SubtitleLine[].
 *
 * WebVTT format:
 *   WEBVTT
 *
 *   00:00:01.000 --> 00:00:04.000
 *   Hello world
 *
 *   00:00:05.000 --> 00:00:08.000
 *   Second line
 */
function parseVTT(text: string): SubtitleLine[] {
  const body = text
    .replace(/^WEBVTT.*\n/, '')
    .replace(/\r\n/g, '\n')
    .trim();

  const blocks = body.split(/\n\n+/);
  const lines: SubtitleLine[] = [];

  for (const block of blocks) {
    const parts = block.trim().split('\n');
    if (parts.length < 1) continue;

    const timeIdx = parts.findIndex((p) => p.includes('-->'));
    if (timeIdx === -1) continue;

    // Only validate the start time — end time may be missing or NaN
    const timeMatch = parts[timeIdx]!.match(
      /(\d{2}):(\d{2}):(\d{2})[.,]\d{3}\s*-->/,
    );
    if (!timeMatch) continue;

    const hours = parseInt(timeMatch[1]!, 10);
    const minutes = parseInt(timeMatch[2]!, 10);
    const seconds = parseInt(timeMatch[3]!, 10);
    const msMatch = parts[timeIdx]!.match(/[.,](\d{3})\s*-->/);
    const millis = msMatch ? parseInt(msMatch[1]!, 10) : 0;
    const starttime = hours * 3600 + minutes * 60 + seconds + millis / 1000;

    const textLines = parts.slice(timeIdx + 1);
    const line = textLines
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .trim();

    if (line && !isNaN(starttime)) {
      lines.push({ starttime, line });
    }
  }

  return lines;
}

/**
 * Detect subtitle format from text content.
 */
export function detectSubtitleFormat(text: string): 'srt' | 'vtt' {
  if (/^WEBVTT/i.test(text.trim())) return 'vtt';
  return 'srt';
}

/**
 * Parse subtitle text (SRT or VTT) into SubtitleLine[].
 * Auto-detects format when not specified.
 */
export function parseSubtitles(text: string, format?: 'srt' | 'vtt'): SubtitleLine[] {
  const fmt = format ?? detectSubtitleFormat(text);
  if (fmt === 'vtt') return parseVTT(text);
  return parseSRT(text);
}
