import React from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import type { DictionaryEntry } from '@langplayer/shared';
import { formatLevel } from '@langplayer/shared';
import { formatPronunciation } from '@langplayer/utils';
import { useT } from '@/hooks/use-t';
import { useScriptPreference } from '@/hooks/use-script-preference';
import { SaveButton } from '@/components/dictionary/SaveButton';
import { SpeakButton } from '@/components/dictionary/SpeakButton';
import { BookOpen, ExternalLink } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';

interface DictionaryDefinitionsPanelProps {
  entry: DictionaryEntry;
  /** ISO 639-1 code of the target language. */
  l2Code: string;
  /** ISO 639-1 code of the user's L1. */
  l1Code?: string;
  /** Pre-formatted pronunciation override. */
  pronunciationOverride?: string | null;
}

/**
 * Renders the definitions and metadata for a dictionary entry as a standalone panel.
 * Ported from web's DictionaryDefinitionsPanel to React Native.
 * Shows: head + alternate script, SpeakButton, pronunciation, level badges, PoS,
 * numbered definitions, classifiers, study materials, han script detail,
 * phonetic extras, source with Google Images link, match_type badge, SaveButton.
 *
 * This is the "definitions panel" sibling to the "tabs panel" (ADR 0007 layout).
 */
export function DictionaryDefinitionsPanel({
  entry,
  l2Code,
  l1Code,
  pronunciationOverride,
}: DictionaryDefinitionsPanelProps) {
  const t = useT();
  const { apply, getAlternateScript } = useScriptPreference(l2Code);
  const { head, alternate } = apply(entry.head, entry.alternate);

  const levels = entry.levels ?? [];
  const levelTexts = levels.map((l) => {
    const formatted = formatLevel({ scale: l.scale, value: l.value });
    return formatted.long;
  });

  const formattedPron = pronunciationOverride !== undefined
    ? pronunciationOverride
    : formatPronunciation(entry, l2Code);

  const displayAlternate = getAlternateScript(entry);

  const sourceName = entry.dictionary?.name ?? entry.source;
  const displaySource = sourceName === 'AI-Generated' || sourceName === 'LLM'
    ? t('label.ai_generated')
    : sourceName;

  const googleImagesUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(entry.head)}`;

  const handleGoogleImages = () => {
    Linking.openURL(googleImagesUrl);
  };

  return (
    <View>
      {/* ── Header: head + alternate + pronunciation + badges ── */}
      <View className="mb-4">
        <View className="flex-row items-start justify-between">
          <View className="flex-1">
            <View className="flex-row items-baseline gap-2 flex-wrap">
              <Text className="text-4xl font-bold text-foreground" lang={l2Code}>
                {head}
              </Text>
              {displayAlternate && displayAlternate !== head && (
                <Text className="text-xl text-muted-foreground" lang={l2Code}>
                  {displayAlternate}
                </Text>
              )}
            </View>

            <View className="mt-2 flex-row flex-wrap items-center gap-2">
              {formattedPron && (
                <>
                  <SpeakButton text={entry.head} l2Code={l2Code} size={18} />
                  <Text className="text-lg text-muted-foreground" lang={l2Code}>
                    {formattedPron}
                  </Text>
                </>
              )}
              {levelTexts.map((text, i) => (
                <View key={i} className="rounded-md bg-primary/10 px-2.5 py-1">
                  <Text className="text-sm font-medium text-primary">{text}</Text>
                </View>
              ))}
              {entry.part_of_speech && (
                <View className="rounded-md bg-muted/50 px-2.5 py-1">
                  <Text className="text-sm font-medium text-muted-foreground">
                    {entry.part_of_speech}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>

      {/* ── Definitions ── */}
      {entry.definitions.length > 0 && (
        <View className="mb-4 rounded-lg bg-muted/40 p-4">
          <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t('title.definitions')}
          </Text>
          {entry.definitions.map((def, i) => (
            <View key={i} className="flex-row items-start gap-2 py-0.5">
              {entry.definitions.length > 1 && (
                <Text className="mt-0.5 flex-shrink-0 text-sm text-muted-foreground">
                  {i + 1}.
                </Text>
              )}
              <Text className="flex-1 text-base leading-relaxed text-foreground">
                {def}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Classifiers (measure words, gender, noun class) ── */}
      {entry.classifier && entry.classifier.length > 0 && (
        <View className="mb-4">
          <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {entry.classifier[0]!.kind === 'gender' ? t('title.gender') :
             entry.classifier[0]!.kind === 'measure_word' ? t('title.measure_words') :
             t('title.classifiers')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {entry.classifier.map((cl, i) => (
              <View key={i} className="inline-flex flex-row items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5">
                {cl.kind === 'measure_word' ? (
                  <>
                    <Text className="font-medium text-foreground" lang={l2Code === 'zh' ? 'zh' : undefined}>
                      {cl.simplified}
                    </Text>
                    <Text className="text-muted-foreground">{cl.reading}</Text>
                  </>
                ) : (
                  <Text className="text-muted-foreground">{cl.value}</Text>
                )}
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ── Study material coverage ── */}
      {entry.studyMaterials && entry.studyMaterials.length > 0 && (
        <View className="mb-4 rounded-lg bg-blue-50/50 p-4 dark:bg-blue-950/20">
          <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t('title.textbook_appearances')}
          </Text>
          {entry.studyMaterials.map((m, i) => (
            <View key={i}>
              <View className="flex-row items-center gap-2">
                <BookOpen size={16} color={ICON_MUTED} />
                <Text className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  {t('label.textbook_format', {
                    material: m.material,
                    book: String(m.location?.book ?? ''),
                    lesson: String(m.location?.lesson ?? ''),
                  })}
                  {m.location?.dialog ? `, ${t('label.dialog')} ${m.location.dialog}` : ''}
                </Text>
              </View>
              {m.example && (
                <Text className="mt-1 text-sm text-foreground" lang={l2Code}>
                  {m.example}
                </Text>
              )}
              {m.exampleTranslation && (
                <Text className="text-sm text-muted-foreground">
                  {m.exampleTranslation}
                </Text>
              )}
              {i < entry.studyMaterials!.length - 1 && (
                <View className="my-2 h-px bg-border" />
              )}
            </View>
          ))}
        </View>
      )}

      {/* ── Han script detail ── */}
      {entry.han_script && (entry.han_script.traditional || entry.han_script.simplified) && (
        <View className="mb-4 flex-row gap-4">
          {entry.han_script.simplified && entry.han_script.simplified !== head && entry.han_script.simplified !== alternate && (
            <Text className="text-sm text-muted-foreground">
              简: {entry.han_script.simplified}
            </Text>
          )}
          {entry.han_script.traditional && entry.han_script.traditional !== head && entry.han_script.traditional !== alternate && (
            <Text className="text-sm text-muted-foreground">
              繁: {entry.han_script.traditional}
            </Text>
          )}
        </View>
      )}

      {/* ── Phonetic detail extras ── */}
      {entry.phonetic_detail && typeof entry.phonetic_detail === 'object' && (
        <View className="mb-4 flex-row flex-wrap gap-x-4 gap-y-1">
          {(Object.entries(entry.phonetic_detail) as [string, unknown][]).map(([key, value]) => {
            if (key === 'romaji' || key === 'pinyin' || key === 'jyutping') return null;
            if (key === 'pinyin_numeric') return null;
            if (key === 'ipa' && value === entry.pronunciation) return null;
            if (typeof value === 'string' && value) {
              return (
                <Text key={key} className="text-sm text-muted-foreground/70">
                  {key}: {value}
                </Text>
              );
            }
            return null;
          })}
        </View>
      )}

      {/* ── Source + Google Images + match_type + SaveButton ── */}
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-1 flex-row items-center gap-2 flex-wrap">
          <BookOpen size={14} color={ICON_MUTED} />
          <Text className="text-xs text-muted-foreground">{displaySource}</Text>
          <Pressable onPress={handleGoogleImages} className="flex-row items-center gap-1">
            <ExternalLink size={14} color={ICON_MUTED} />
            <Text className="text-xs text-muted-foreground underline">
              {t('action.search_images')}
            </Text>
          </Pressable>
          {entry.match_type && entry.match_type !== 'exact' && (
            <View className="rounded bg-amber-100 px-1.5 py-0.5 dark:bg-amber-900/30">
              <Text className="text-xs text-amber-700 dark:text-amber-400">
                {entry.match_type}
              </Text>
            </View>
          )}
        </View>
        <SaveButton entry={entry} size={20} />
      </View>
    </View>
  );
}
