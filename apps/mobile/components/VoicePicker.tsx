import React, { useState, useEffect, useCallback } from 'react';
import { View, Text } from 'react-native';
import { MenuView } from '@react-native-menu/menu';
import { Pressable } from '@/components/ui/pressable';
import * as Speech from 'expo-speech';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { getSampleSentence } from '@langplayer/shared';
import { Volume2, Square, ChevronDown } from 'lucide-react-native';
import { ICON_MUTED, ICON_DESTRUCTIVE } from '@/lib/theme-colors';

const RATES = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

/** VoicePicker for mobile — simplified Web Speech API to expo-speech port.
 *  expo-speech doesn't expose voice enumeration, so we fall back to
 *  language-based selection + rate.
 *  Speech settings are persisted via l2.speech (V2 unified store). */
export function VoicePicker() {
  const { l2Lang } = useLanguage();
  const t = useT();
  const { getL2, updateL2, loaded } = useSettingsContext();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceList, setVoiceList] = useState<{ identifier: string; name: string; language: string }[]>([]);

  const l2Settings = loaded ? getL2(l2Lang.code) : null;
  const rate = l2Settings?.speech.rate ?? 1.0;
  const selectedVoice = l2Settings?.speech.voiceURI ?? null;

  // Load installed voices (expo-speech enumerates on both iOS and Android;
  // the web build throws, which the catch tolerates — picker stays hidden).
  useEffect(() => {
    Speech.getAvailableVoicesAsync().then((voices) => {
      setVoiceList(voices.map((v) => ({ identifier: v.identifier, name: v.name, language: v.language })));
    }).catch(() => {});
  }, []);

  const l2Voices = voiceList.filter((v) => v.language.startsWith(l2Lang.code + '-') || v.language === l2Lang.code);

  // Test speak — uses locale-aware language name (matching web VoicePicker)
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
    // Speak a real sentence in the target language — the language name
    // ("Japanese") is read incorrectly by many TTS voices.
    Speech.speak(getSampleSentence(l2Lang.code), options);
    setIsSpeaking(true);
    // expo-speech doesn't have onDone callback in v14+, so use a timer
    setTimeout(() => setIsSpeaking(false), 3000);
  }, [isSpeaking, l2Lang, rate, selectedVoice]);

  return (
    <View className="mb-5">
      <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wide border-b border-border pb-2 mb-3">
        {t('setting.speech')}
      </Text>

      {/* Voice picker (only if voices are available) — native UIMenu/PopupMenu */}
      {voiceList.length > 0 && (
        <View className="mb-4">
          <Text className="text-sm font-medium text-foreground mb-1.5">{t('label.pronunciation_voice')}</Text>
          <MenuView
            onPressAction={({ nativeEvent }) => {
              const ev = nativeEvent.event;
              if (ev === '__auto__') {
                updateL2(l2Lang.code, { speech: { ...l2Settings!.speech, voiceURI: null } });
              } else {
                updateL2(l2Lang.code, { speech: { ...l2Settings!.speech, voiceURI: ev } });
              }
            }}
            actions={[
              // "Auto" option — always present, matching the web picker, so a
              // saved voice can always be reset to auto-selection.
              { id: '__auto__', title: t('label.auto_best_available'), state: selectedVoice ? ('on' as const) : ('off' as const) },
              // L2 voices (preferred).
              ...l2Voices.map((v) => ({
                id: v.identifier,
                title: v.name,
                state: (selectedVoice === v.identifier ? 'on' : 'off') as 'on' | 'off',
              })),
            ]}
          >
            <Pressable className="flex-row items-center justify-between rounded-lg border border-border bg-card px-3 py-3">
              <Text className="text-sm text-foreground flex-1" numberOfLines={1}>
                {selectedVoice
                  ? voiceList.find((v) => v.identifier === selectedVoice)?.name ?? t('label.custom_voice')
                  : l2Voices.length > 0
                    ? t('label.auto_best_available')
                    : t('label.auto_best_for', { l2: l2Lang.code.toUpperCase() })}
              </Text>
              <ChevronDown size={16} color={ICON_MUTED} />
            </Pressable>
          </MenuView>
        </View>
      )}

      {/* Rate picker */}
      <View className="mb-2">
        <Text className="text-sm font-medium text-foreground mb-1.5">
          {t('label.speech_rate', { rate: rate.toFixed(2) })}
        </Text>
        <View className="flex-row gap-1.5 mt-2">
          {RATES.map((r) => (
            <Pressable
              key={r}
              onPress={() => updateL2(l2Lang.code, { speech: { ...l2Settings!.speech, rate: r } })}
              className={`flex-1 py-2 items-center rounded-md border ${rate === r ? 'bg-primary/10 border-primary' : 'border-border'}`}
            >
              <Text className={`text-xs ${rate === r ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>{r}x</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Test button */}
      <Pressable
        onPress={handleTest}
        className={`flex-row items-center justify-center gap-2 rounded-lg px-3 py-3 mt-4 border ${
          isSpeaking ? 'border-destructive/30 bg-destructive/10' : 'border-border bg-card'
        }`}
      >
        {isSpeaking ? (
          <>
            <Square size={16} color={ICON_DESTRUCTIVE} />
            <Text className="text-sm font-medium text-destructive">{t('action.stop')}</Text>
          </>
        ) : (
          <>
            <Volume2 size={16} color={ICON_MUTED} />
            <Text className="text-sm font-medium text-muted-foreground">
              {t('label.play_pronunciation_for', { language: l2Lang.name })}
            </Text>
          </>
        )}
      </Pressable>
    </View>
  );
}
