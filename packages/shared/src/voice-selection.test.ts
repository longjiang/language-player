import { describe, expect, it } from 'vitest';

import {
  LANG_TO_SPEECH_TAG,
  langPrimary,
  normalizeLangTag,
  pickBestVoice,
  rankVoicesForL2,
  scoreVoice,
  voiceMatchesL2,
  voiceQualityTier,
  type VoiceCandidate,
} from './voice-selection';

/** Compact builder for test candidates. */
function voice(overrides: Partial<VoiceCandidate> & { identifier: string }): VoiceCandidate {
  return {
    name: overrides.identifier,
    lang: 'en-US',
    ...overrides,
  };
}

// Realistic voice fixtures per platform — derived from the voices observed on
// a macOS machine (`AVSpeechSynthesisVoice.speechVoices()`), Google's Android
// TTS naming, and Microsoft Edge's "Online (Natural)" naming.
const macJaVoices: VoiceCandidate[] = [
  { identifier: 'com.apple.voice.compact.ja-JP.Kyoko', name: 'Kyoko', lang: 'ja-JP', quality: 'Default' },
  { identifier: 'com.apple.eloquence.ja-JP.Eddy', name: 'Eddy', lang: 'ja-JP', quality: 'Default' },
  { identifier: 'com.apple.eloquence.ja-JP.Flo', name: 'Flo', lang: 'ja-JP', quality: 'Default' },
  { identifier: 'com.apple.speech.synthesis.voice.Zarvox', name: 'Zarvox', lang: 'ja-JP' },
  { identifier: 'com.apple.voice.enhanced.ja-JP.Otoya', name: 'Otoya (Enhanced)', lang: 'ja-JP', quality: 'Enhanced' },
  { identifier: 'com.apple.voice.premium.zh-CN.Yue', name: 'Yue (Premium)', lang: 'zh-CN', quality: 'Default' },
];

const webMacVoices: VoiceCandidate[] = [
  { identifier: 'Kyoko', name: 'Kyoko', lang: 'ja-JP', localService: true, isDefault: false },
  { identifier: 'Google 日本語', name: 'Google 日本語', lang: 'ja-JP', localService: false },
  { identifier: 'Otoya (Enhanced)', name: 'Otoya (Enhanced)', lang: 'ja-JP', localService: true },
  { identifier: 'Albert', name: 'Albert', lang: 'en-US', localService: true },
];

const edgeVoices: VoiceCandidate[] = [
  { identifier: 'Microsoft Nanami Online (Natural) - Japanese (Japan)', name: 'Microsoft Nanami Online (Natural) - Japanese (Japan)', lang: 'ja-JP', localService: false },
  { identifier: 'Microsoft Ayumi - Japanese (Japan)', name: 'Microsoft Ayumi - Japanese (Japan)', lang: 'ja-JP', localService: true },
];

const androidVoices: VoiceCandidate[] = [
  { identifier: 'cmn-cn-x-ccc-local', name: 'cmn-cn-x-ccc-local', lang: 'zh-CN', quality: 'Default' },
  { identifier: 'cmn-cn-x-ccc-network', name: 'cmn-cn-x-ccc-network', lang: 'zh-CN', quality: 'Enhanced' },
];

describe('normalizeLangTag / langPrimary', () => {
  it('normalizes underscores and case (Chrome-on-Android "en_us")', () => {
    expect(normalizeLangTag('en_us')).toBe('en-us');
    expect(normalizeLangTag(' EN-us ')).toBe('en-us');
  });

  it('extracts the primary subtag', () => {
    expect(langPrimary('en-US')).toBe('en');
    expect(langPrimary('zh_CN')).toBe('zh');
  });
});

describe('voiceMatchesL2', () => {
  it('matches the L2 primary subtag', () => {
    expect(voiceMatchesL2('ja-JP', 'ja')).toBe(true);
    expect(voiceMatchesL2('en-US', 'en')).toBe(true);
    expect(voiceMatchesL2('en-US', 'ja')).toBe(false);
  });

  it('matches via the mapped speech tag family (yue/nan → zh-*)', () => {
    expect(voiceMatchesL2('zh-HK', 'yue')).toBe(true);
    expect(voiceMatchesL2('zh-TW', 'nan')).toBe(true);
    expect(voiceMatchesL2('yue-CN', 'yue')).toBe(true);
  });
});

describe('voiceQualityTier', () => {
  it('ranks Apple premium above enhanced above default', () => {
    const premium = voiceQualityTier(voice({ identifier: 'com.apple.voice.premium.zh-CN.Yue', name: 'Yue (Premium)' }));
    const enhanced = voiceQualityTier(voice({ identifier: 'com.apple.voice.enhanced.ja-JP.Otoya', name: 'Otoya (Enhanced)' }));
    const compact = voiceQualityTier(voice({ identifier: 'com.apple.voice.compact.ja-JP.Kyoko', name: 'Kyoko' }));
    expect(premium).toBeGreaterThan(enhanced);
    expect(enhanced).toBeGreaterThan(compact);
  });

  it('repairs expo-speech mislabeling premium voices as Default (iOS)', () => {
    // expo-speech maps AVSpeechSynthesisVoiceQuality.premium to "Default"
    // because it only checks `== .enhanced`; the identifier must win.
    const tier = voiceQualityTier(
      voice({ identifier: 'com.apple.voice.premium.zh-CN.Yue', name: 'Yue (Premium)', quality: 'Default' }),
    );
    expect(tier).toBe(3);
  });

  it('detects Edge natural voices and Chrome network voices by name', () => {
    expect(voiceQualityTier(voice({ identifier: 'Microsoft Nanami Online (Natural) - Japanese (Japan)' }))).toBe(3);
    expect(voiceQualityTier(voice({ identifier: 'Google 日本語', name: 'Google 日本語' }))).toBe(1);
  });

  it('deprioritizes macOS novelty/Eloquence voices', () => {
    expect(voiceQualityTier(voice({ identifier: 'com.apple.eloquence.ja-JP.Eddy', name: 'Eddy', quality: 'Default' }))).toBe(0);
    expect(voiceQualityTier(voice({ identifier: 'Zarvox', name: 'Zarvox' }))).toBe(0);
  });
});

describe('rankVoicesForL2', () => {
  it('excludes voices that do not match the L2', () => {
    const ranked = rankVoicesForL2(macJaVoices, 'ja');
    expect(ranked.every(v => voiceMatchesL2(v.lang, 'ja'))).toBe(true);
    expect(ranked.some(v => v.identifier === 'com.apple.voice.premium.zh-CN.Yue')).toBe(false);
  });

  it('puts the enhanced Apple voice ahead of compact and novelty voices (macOS)', () => {
    const ranked = rankVoicesForL2(macJaVoices, 'ja');
    expect(ranked[0]!.identifier).toBe('com.apple.voice.enhanced.ja-JP.Otoya');
    expect(ranked[1]!.identifier).toBe('com.apple.voice.compact.ja-JP.Kyoko');
    // Novelty/Eloquence voices sink to the very bottom.
    const ids = ranked.map(v => v.identifier);
    expect(ids[ids.length - 1]).toBe('com.apple.speech.synthesis.voice.Zarvox');
    expect(ids.indexOf('com.apple.voice.enhanced.ja-JP.Otoya'))
      .toBeLessThan(ids.indexOf('com.apple.eloquence.ja-JP.Eddy'));
  });

  it('ranks Edge natural voices above local SAPI voices (Windows)', () => {
    const ranked = rankVoicesForL2(edgeVoices, 'ja');
    expect(ranked[0]!.name).toContain('(Natural)');
  });

  it('ranks Android Enhanced (network) voices above Default (local) ones', () => {
    const ranked = rankVoicesForL2(androidVoices, 'zh');
    expect(ranked[0]!.identifier).toBe('cmn-cn-x-ccc-network');
  });

  it('breaks score ties deterministically by name', () => {
    const a = voice({ identifier: 'b-voice', name: 'Bernard', lang: 'en-US' });
    const b = voice({ identifier: 'a-voice', name: 'Alice', lang: 'en-US' });
    const ranked = rankVoicesForL2([a, b], 'en');
    expect(ranked[0]!.name).toBe('Alice');
  });

  it('dedupes identical identifiers (iOS lists some voices twice)', () => {
    const dup = voice({ identifier: 'Kyoko', name: 'Kyoko', lang: 'ja-JP' });
    const ranked = rankVoicesForL2([dup, dup], 'ja');
    expect(ranked).toHaveLength(1);
  });
});

describe('pickBestVoice', () => {
  it('returns null when no voice matches the L2 (never a wrong-language voice)', () => {
    expect(pickBestVoice(macJaVoices, 'th')).toBeNull();
  });

  it('honors the user’s preferred voice when it still exists', () => {
    const best = pickBestVoice(macJaVoices, 'ja', 'com.apple.voice.compact.ja-JP.Kyoko');
    expect(best?.identifier).toBe('com.apple.voice.compact.ja-JP.Kyoko');
  });

  it('ignores a stale preferred voice (uninstalled / synced from another device)', () => {
    const best = pickBestVoice(macJaVoices, 'ja', 'com.apple.voice.enhanced.de-DE.Anna');
    expect(best?.identifier).toBe('com.apple.voice.enhanced.ja-JP.Otoya');
  });

  it('prefers exact canonical tag match within the same quality tier', () => {
    const candidates = [
      voice({ identifier: 'tw', name: 'Meijia', lang: 'zh-TW' }),
      voice({ identifier: 'cn', name: 'Tingting', lang: 'zh-CN' }),
    ];
    // Same tier (default) — zh's canonical tag zh-CN wins over zh-TW.
    expect(pickBestVoice(candidates, 'zh')?.identifier).toBe('cn');
    expect(LANG_TO_SPEECH_TAG.zh).toBe('zh-CN');
  });

  it('lets quality beat the exact-tag bonus (quality is the dominant factor)', () => {
    const candidates = [
      voice({ identifier: 'cn', name: 'Tingting', lang: 'zh-CN' }), // default tier
      voice({ identifier: 'tw', name: 'Meijia (Enhanced)', lang: 'zh-TW' }), // enhanced tier
    ];
    expect(pickBestVoice(candidates, 'zh')?.identifier).toBe('tw');
  });

  it('prefers a matching web voice over "Google" network voices of lower tier', () => {
    const best = pickBestVoice(webMacVoices, 'ja');
    expect(best?.identifier).toBe('Otoya (Enhanced)');
  });
});

describe('scoreVoice determinism', () => {
  it('is stable across repeated calls', () => {
    const v = macJaVoices[4]!;
    expect(scoreVoice(v, 'ja')).toBe(scoreVoice(v, 'ja'));
  });
});
