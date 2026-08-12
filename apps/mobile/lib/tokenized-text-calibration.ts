/**
 * One-off dev calibration for tokenized-text pagination.
 *
 * Tokenized rows (furigana ruby, interlinear definitions, scaled typefaces)
 * can be much taller than the plain-text fallback the measuring view uses.
 * Instead of hardcoding a magic multiplier, the reader measures real
 * TokenizedText against plain Text with the user's actual settings, then
 * caches a per-settings ratio for the rest of the session.
 */

export interface TokenizedTextCalibration {
  signature: string;
  plainLineHeight: number;
  tokenizedLineHeight: number;
  /** tokenized line height / plain line height (average over samples). */
  ratio: number;
  /** Average extra pixels per wrapped line (tokenized - plain). */
  extraPerLine: number;
  sampleCount: number;
  measuredAt: number;
}

export interface CalibrationSettingsSignature {
  l2Code: string;
  textScale: number;
  zoom: number;
  typeFace: string;
  phoneticsShow: string | false;
  phoneticsConditions: string;
  definitionShow: boolean;
}

const calibrationCache = new Map<string, TokenizedTextCalibration>();

export function calibrationSignature(settings: CalibrationSettingsSignature): string {
  return [
    settings.l2Code,
    settings.textScale,
    settings.zoom,
    settings.typeFace,
    settings.phoneticsShow ?? 'off',
    settings.phoneticsConditions,
    settings.definitionShow ? 'def' : 'nodef',
  ].join('|');
}

export function getCachedCalibration(signature: string): TokenizedTextCalibration | null {
  return calibrationCache.get(signature) ?? null;
}

export function cacheCalibration(calibration: TokenizedTextCalibration): void {
  calibrationCache.set(calibration.signature, calibration);
}

export function deriveCalibration(
  signature: string,
  plainLineHeight: number,
  samples: { plainHeight: number; tokenizedHeight: number }[],
): TokenizedTextCalibration | null {
  if (samples.length === 0) return null;
  let ratioSum = 0;
  let extraSum = 0;
  let counted = 0;
  for (const s of samples) {
    if (s.plainHeight <= 0 || s.tokenizedHeight <= 0) continue;
    const lineCount = Math.max(1, Math.round(s.plainHeight / plainLineHeight));
    ratioSum += s.tokenizedHeight / s.plainHeight;
    extraSum += (s.tokenizedHeight - s.plainHeight) / lineCount;
    counted++;
  }
  if (counted === 0) return null;
  const ratio = ratioSum / counted;
  const extraPerLine = extraSum / counted;
  return {
    signature,
    plainLineHeight,
    tokenizedLineHeight: Math.max(plainLineHeight, Math.round(plainLineHeight * ratio)),
    ratio,
    extraPerLine: Math.round(extraPerLine),
    sampleCount: counted,
    measuredAt: Date.now(),
  };
}
