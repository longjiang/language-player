import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import * as Speech from 'expo-speech';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { Volume2, Square, ChevronDown } from 'lucide-react-native';
import { ICON_MUTED, ICON_PRIMARY, ICON_DESTRUCTIVE } from '@/lib/theme-colors';

const RATES = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

/** Language names in their own language (for TTS test). */
const L2_SELF_NAME: Record<string, string> = {
  af: 'Afrikaans', ar: 'العربية', ca: 'Català', de: 'Deutsch',
  el: 'Ελληνικά', en: 'English', es: 'Español', fi: 'Suomi',
  fr: 'Français', ga: 'Gaeilge', hi: 'हिन्दी', hr: 'Hrvatski',
  hu: 'Magyar', id: 'Bahasa Indonesia', it: 'Italiano',
  ja: '日本語', ko: '한국어', nl: 'Nederlands',
  no: 'Norsk', pl: 'Polski', pt: 'Português', ro: 'Română',
  ru: 'Русский', sr: 'Српски', sv: 'Svenska', sw: 'Kiswahili',
  th: 'ไทย', tr: 'Türkçe', vi: 'Tiếng Việt',
  'zh-Hans': '简体中文', 'zh-Hant': '繁體中文', yue: '廣東話',
};

/** VoicePicker for mobile — simplified Web Speech API to expo-speech port.
 *  expo-speech doesn't expose voice enumeration, so we fall back to
 *  language-based selection + rate. */
export function VoicePicker() {
  const { l2Lang } = useLanguage();
  const t = useT();
  const [rate, setRate] = useState(0.75);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceList, setVoiceList] = useState<{ identifier: string; name: string; language: string }[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null);
  const [showVoices, setShowVoices] = useState(false);
  const [showRates, setShowRates] = useState(false);

  // Load available voices (iOS only — Android doesn't expose this API)
  useEffect(() => {
    Speech.getAvailableVoicesAsync().then((voices) => {
      setVoiceList(voices.map((v) => ({ identifier: v.identifier, name: v.name, language: v.language })));
    }).catch(() => {});
  }, []);

  const l2Voices = voiceList.filter((v) => v.language.startsWith(l2Lang.code + '-') || v.language === l2Lang.code);
  const otherVoices = voiceList.filter((v) => !l2Voices.includes(v));

  // Test speak
  const handleTest = useCallback(() => {
    if (isSpeaking) {
      Speech.stop();
      setIsSpeaking(false);
      return;
    }
    const options: Speech.SpeechOptions = {
      language: l2Lang.code,
      rate,
    };
    if (selectedVoice) (options as any).voice = selectedVoice;
    Speech.speak(L2_SELF_NAME[l2Lang.code] ?? l2Lang.name, options);
    setIsSpeaking(true);
    // expo-speech doesn't have onDone callback in v14+, so use a timer
    setTimeout(() => setIsSpeaking(false), 3000);
  }, [isSpeaking, l2Lang, rate, selectedVoice]);

  const s = {
    section: { marginBottom: 20 } as const,
    label: { fontSize: 14, fontWeight: '500' as const, color: '#0f172a', marginBottom: 6 },
    pickerBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 12, backgroundColor: '#fff' },
    pickerText: { fontSize: 14, color: '#0f172a', flex: 1 },
    dropdown: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, marginTop: 4, backgroundColor: '#fff', maxHeight: 200, overflow: 'hidden' as const },
    dropdownItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
    activeItem: { backgroundColor: '#eff6ff' },
    activeText: { color: '#3b82f6', fontWeight: '600' as const },
    voiceName: { fontSize: 13, color: '#0f172a', flex: 1 },
    voiceLang: { fontSize: 12, color: '#94a3b8' },
    rateRow: { flexDirection: 'row' as const, gap: 6, marginTop: 8 },
    rateBtn: { flex: 1, paddingVertical: 8, alignItems: 'center' as const, borderRadius: 6, borderWidth: 1, borderColor: '#e2e8f0' },
    rateBtnActive: { backgroundColor: '#eff6ff', borderColor: '#3b82f6' },
    rateText: { fontSize: 13, color: '#94a3b8' },
    rateTextActive: { color: '#3b82f6', fontWeight: '600' as const },
    testBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, borderRadius: 8, padding: 12, marginTop: 16, borderWidth: 1 },
    testBtnPlay: { borderColor: '#e2e8f0', backgroundColor: '#fff' },
    testBtnStop: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
    testText: { fontSize: 14, fontWeight: '500' as const, color: '#64748b' },
    testTextStop: { color: '#dc2626' },
    sectionTitle: { fontSize: 11, fontWeight: '700' as const, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: 0.5, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingBottom: 8, marginBottom: 12 },
  };

  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{t('setting.speech')}</Text>

      {/* Voice picker (only if voices are available) */}
      {voiceList.length > 0 && (
        <View style={{ marginBottom: 16 }}>
          <Text style={s.label}>{t('label.pronunciation_voice')}</Text>
          <Pressable onPress={() => setShowVoices(!showVoices)} style={s.pickerBtn}>
            <Text style={s.pickerText} numberOfLines={1}>
              {selectedVoice ? voiceList.find((v) => v.identifier === selectedVoice)?.name ?? t('label.custom_voice') : l2Voices.length > 0 ? t('label.auto_best_available') : t('label.auto_best_for', { l2: l2Lang.code.toUpperCase() })}
            </Text>
            <ChevronDown size={16} color={ICON_MUTED} />
          </Pressable>

          {showVoices && (
            <View style={s.dropdown}>
              {/* Auto option */}
              {!selectedVoice ? null : (
                <Pressable onPress={() => { setSelectedVoice(null); setShowVoices(false); }} style={s.dropdownItem}>
                  <Volume2 size={14} color={ICON_MUTED} />
                  <Text style={{ fontSize: 13, color: '#0f172a', flex: 1 }}>{t('label.auto_best_available')}</Text>
                </Pressable>
              )}

              {/* L2 voices */}
              {l2Voices.map((v) => (
                <Pressable key={v.identifier} onPress={() => { setSelectedVoice(v.identifier); setShowVoices(false); }}
                  style={[s.dropdownItem, selectedVoice === v.identifier && s.activeItem]}>
                  <Volume2 size={14} color={selectedVoice === v.identifier ? ICON_PRIMARY : ICON_MUTED} />
                  <Text style={[s.voiceName, selectedVoice === v.identifier && s.activeText]} numberOfLines={1}>{v.name}</Text>
                  <Text style={s.voiceLang}>{v.language}</Text>
                </Pressable>
              ))}

              {/* Other voices — only show if no L2 voices available */}
              {l2Voices.length === 0 && otherVoices.slice(0, 10).map((v) => (
                <Pressable key={v.identifier} onPress={() => { setSelectedVoice(v.identifier); setShowVoices(false); }}
                  style={[s.dropdownItem, selectedVoice === v.identifier && s.activeItem]}>
                  <Volume2 size={14} color={selectedVoice === v.identifier ? ICON_PRIMARY : ICON_MUTED} />
                  <Text style={[s.voiceName, selectedVoice === v.identifier && s.activeText]} numberOfLines={1}>{v.name}</Text>
                  <Text style={s.voiceLang}>{v.language}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Rate picker */}
      <View style={{ marginBottom: 8 }}>
        <Text style={s.label}>{t('label.speech_rate', { rate: rate.toFixed(2) })}</Text>
        <View style={s.rateRow}>
          {RATES.map((r) => (
            <Pressable key={r} onPress={() => setRate(r)} style={[s.rateBtn, rate === r && s.rateBtnActive]}>
              <Text style={[s.rateText, rate === r && s.rateTextActive]}>{r}x</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Test button */}
      <Pressable onPress={handleTest} style={[s.testBtn, isSpeaking ? s.testBtnStop : s.testBtnPlay]}>
        {isSpeaking ? (
          <>
            <Square size={16} color={ICON_DESTRUCTIVE} />
            <Text style={s.testTextStop}>{t('action.stop')}</Text>
          </>
        ) : (
          <>
            <Volume2 size={16} color={ICON_MUTED} />
            <Text style={s.testText}>{t('label.play_pronunciation_for', { language: l2Lang.name })}</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}
