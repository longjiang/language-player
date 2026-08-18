import { describe, expect, it } from 'vitest';
import {
  TRANSLATION_FACTOR,
  TRANSLATION_SIZE_MAX,
  TRANSLATION_SIZE_MIN,
  clampTranslationSize,
  translationSizeFactor,
} from './reader-text-size';

describe('clampTranslationSize', () => {
  it('passes values inside [0.5, 1] through', () => {
    expect(clampTranslationSize(0.8)).toBe(0.8);
    expect(clampTranslationSize(0.5)).toBe(0.5);
    expect(clampTranslationSize(1)).toBe(1);
  });

  it('clamps below-min and above-max values', () => {
    expect(clampTranslationSize(0.1)).toBe(TRANSLATION_SIZE_MIN);
    expect(clampTranslationSize(1.5)).toBe(TRANSLATION_SIZE_MAX);
    expect(clampTranslationSize(-2)).toBe(TRANSLATION_SIZE_MIN);
  });
});

describe('translationSizeFactor', () => {
  it('uses the setting value when present', () => {
    expect(translationSizeFactor({ tokenizedText: { translationSize: 0.5 } })).toBe(0.5);
    expect(translationSizeFactor({ tokenizedText: { translationSize: 1 } })).toBe(1);
  });

  it('clamps out-of-range setting values', () => {
    expect(translationSizeFactor({ tokenizedText: { translationSize: 0.2 } })).toBe(
      TRANSLATION_SIZE_MIN,
    );
    expect(translationSizeFactor({ tokenizedText: { translationSize: 1.4 } })).toBe(
      TRANSLATION_SIZE_MAX,
    );
  });

  it('falls back to the default when the setting is absent or invalid', () => {
    expect(translationSizeFactor({})).toBe(TRANSLATION_FACTOR);
    expect(translationSizeFactor({ tokenizedText: {} })).toBe(TRANSLATION_FACTOR);
    expect(translationSizeFactor({ tokenizedText: { translationSize: NaN } })).toBe(
      TRANSLATION_FACTOR,
    );
  });
});
