import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import type { DictionaryEntry, SavedWordContext } from '@langplayer/shared';
import { formatNumericLevel, primaryScale } from '@langplayer/shared';
import { formatPronunciation } from '@langplayer/utils';
import { useT } from '@/hooks/use-t';
import { useScriptPreference } from '@/hooks/use-script-preference';
import { BookOpen, Bookmark, ExternalLink } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';
import { SpeakButton } from '@/components/dictionary/SpeakButton';
import { useSavedWords } from '@/hooks/use-saved-words';
import { useLanguage } from '@/contexts/LanguageContext';
import { WebViewSheet } from '@/components/WebViewSheet';

interface DictionaryEntryCardProps {
  entry: DictionaryEntry;
  /** 'compact' = popup/list view; 'full' = detail page view */
  variant?: 'compact' | 'full';
  /** Called when the card is tapped (navigates to entry detail page). */
  onPress?: (entry: DictionaryEntry) => void;
  /** ISO 639-1 code of the target language (for script preference + pitch accent). */
  l2Code?: string;
  /** ISO 639-1 code of the user's L1 (for SpeakButton / AI explain language context). */
  l1Code?: string;
  /** Optional save button to render at the top-right of the card. */
  saveButton?: React.ReactNode;
  /** Context for save/bookmark button. */
  saveContext?: SavedWordContext;
  /** Pre-formatted pronunciation override. Uses formatPronunciation if omitted. */
  pronunciation?: string | null;
}

/** Renders the entry details for a dictionary lookup result — compact in popups, full on detail pages.
 *  No tabs. Use DictionaryEntryTabs to wrap this card with tabbed sections (Examples, DeepSeek, etc.). */
export function DictionaryEntryCard({
  entry,
  variant = 'compact',
  onPress,
  l2Code = '',
  l1Code,
  saveButton,
  saveContext,
  pronunciation: pronunciationOverride,
}: DictionaryEntryCardProps) {
  const router = useRouter();
  const t = useT();
  const { l2Lang } = useLanguage();
  const [showImageSearch, setShowImageSearch] = useState(false);
  const { hasWord, savedWords, saveWord, removeWord } = useSavedWords(l2Lang.code);
  const [wordSaved, setWordSaved] = React.useState(false);

  // Sync wordSaved with the async SecureStore load
  React.useEffect(() => {
    setWordSaved(hasWord(l2Lang.code, entry.id));
  }, [hasWord, savedWords, l2Lang.code, entry.id]);

  const toggleSave = React.useCallback(() => {
    if (wordSaved) {
      removeWord(l2Lang.code, entry.id);
      setWordSaved(false);
    } else {
      saveWord(l2Lang.code, {
        id: entry.id,
        head: entry.head,
        dictionaryId: entry.dictionary?.id ?? '',
        entryId: entry.id,
      });
      setWordSaved(true);
    }
  }, [wordSaved, l2Lang.code, entry.id, entry.head, entry.dictionary?.id, saveWord, removeWord]);
  const { apply, getAlternateScript } = useScriptPreference(l2Code);
  const { head, alternate } = apply(entry.head, entry.alternate);
  const displayAlternate = getAlternateScript({ ...entry, head, alternate });

  const scale = primaryScale(l2Code);
  const formattedLevels = (entry.levels ?? [])
    .filter((l) => l.numeric != null)
    .map((l) => formatNumericLevel(l.numeric, scale));
  const isFull = variant === 'full';

  const formattedPron = pronunciationOverride !== undefined
    ? pronunciationOverride
    : formatPronunciation(entry, l2Code);

  // Study materials coverage
  const studyMaterials = entry.studyMaterials;

  // ── Shared: level + POS badges ──
  const badges = (
    <View className="flex-row flex-wrap gap-1">
      {formattedLevels.map((level, i) => (
        <View key={i} className="rounded px-1.5 py-0.5" style={{ backgroundColor: level.hexColor + '1A' }}>
          <Text className="text-xs font-bold" style={{ color: level.hexColor }}>{level.short}</Text>
        </View>
      ))}

    </View>
  );

  // ── Shared: source line ──
  const sourceName = entry.dictionary?.name ?? entry.source;
  const displaySource = sourceName === 'AI-Generated' || sourceName === 'LLM'
    ? t('label.ai_generated')
    : sourceName;
  const googleImagesUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(entry.head)}`;
  const sourceLine = (
    <View className="flex-row items-center gap-2">
      <Text className="text-[10px] text-muted-foreground/50">
        {displaySource}
        {entry.match_type && entry.match_type !== 'exact' && (
          <Text className="text-[10px] text-amber-600"> · {entry.match_type}</Text>
        )}
      </Text>
      <Pressable
        onPress={() => setShowImageSearch(true)}
        className="flex-row items-center gap-0.5"
      >
        <ExternalLink size={10} color={ICON_MUTED} />
        <Text className="text-[10px] text-muted-foreground/50 underline">{t('action.search_images')}</Text>
      </Pressable>
    </View>
  );

  // ── COMPACT variant ──
  if (!isFull) {
    const compactDefs = entry.definitions ?? [];
    return (
      <Pressable
        onPress={() => { onPress?.(entry); }}
        style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
      >
        <View className="rounded-xl border border-border bg-card px-4 pt-4 pb-2">
          {/* Head + alt + pronunciation + badges */}
          <View className="flex-row items-start">
            <View className="flex-1 flex-row items-center gap-2 flex-wrap">
              <Text className="text-lg font-bold text-foreground">{head}</Text>
              {displayAlternate && displayAlternate !== head && (
                <Text className="text-xs text-muted-foreground" lang={l2Code}>{displayAlternate}</Text>
              )}
              <SpeakButton text={head} l2Code={l2Code} size={14} />
              {formattedPron ? (
                <Text className="text-sm text-muted-foreground">{formattedPron}</Text>
              ) : null}
            </View>
            {badges}
          </View>

          {/* Definitions */}
          {(entry.part_of_speech || compactDefs.length > 0) && (
            <Text className="mt-2 text-sm leading-snug text-muted-foreground">
              {entry.part_of_speech && (
                <Text className="italic">{entry.part_of_speech}{'  '}</Text>
              )}
              {compactDefs.map((def, i) => (
                <Text key={i}>
                  <Text className="font-bold">{i + 1}</Text>
                  {' '}{def}{i < compactDefs.length - 1 ? '  ' : ''}
                </Text>
              ))}
            </Text>
          )}

          {/* Source + save */}
          {displaySource || saveButton ? (
            <View className="mt-2 flex-row items-center justify-between">
              {displaySource ? <View className="flex-1">{sourceLine}</View> : <View className="flex-1" />}
              {saveButton ? <View className="-mr-1">{saveButton as any}</View> : null}
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  }

  // ── FULL variant ──
  return (
    <View>
      {/* Head + alt script + badges — tappable to navigate to entry detail page */}
      <Pressable
        onPress={() => {
          if (onPress) {
            onPress(entry);
          } else {
            router.push(`/(tabs)/(vocab)/word/${encodeURIComponent(entry.id)}` as any);
          }
        }}
        className="active:opacity-70"
      >
        <View className="flex-row items-start gap-2">
          <Text className="text-3xl font-bold text-foreground shrink-0" lang={l2Code}>{head}</Text>
          {displayAlternate && (
            <Text className="mt-2 text-base text-muted-foreground shrink-0" lang={l2Code}>{displayAlternate}</Text>
          )}
          <View className="flex-1" />
          {badges}
        </View>
      </Pressable>

      {/* Pronunciation row */}
      <View className="mt-2 flex-row flex-wrap items-center gap-2">
        <SpeakButton text={head} l2Code={l2Code} size={18} />
        {formattedPron && (
          <Text className="text-base text-muted-foreground">{formattedPron}</Text>
        )}
      </View>

      {/* Definitions */}
      {entry.definitions.length > 0 && (
        <View className="mt-4 rounded-lg bg-muted/40 p-3">
          {entry.part_of_speech && (
            <Text className="mb-2 text-xs italic text-muted-foreground">{entry.part_of_speech}</Text>
          )}
          {entry.definitions.map((def, i) => (
            <View key={i} className="flex-row gap-2 mb-1.5">
              {entry.definitions.length > 1 && (
                <Text className="text-sm text-muted-foreground shrink-0">{i + 1}.</Text>
              )}
              <Text className="text-sm text-foreground flex-1">{def}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Classifiers */}
      {entry.classifier && entry.classifier.length > 0 && (
        <View className="mt-4">
          <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {entry.classifier[0]!.kind === 'gender' ? t('title.gender') :
             entry.classifier[0]!.kind === 'measure_word' ? t('title.measure_words') :
             t('title.classifiers')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {entry.classifier.map((cl, i) => (
              <View key={i} className="rounded-lg bg-primary/10 px-2.5 py-1">
                {cl.kind === 'measure_word' ? (
                  <Text className="text-sm">
                    <Text className="font-medium" lang={l2Code}>{cl.simplified}</Text>
                    {' '}
                    <Text className="text-muted-foreground">{cl.reading}</Text>
                  </Text>
                ) : (
                  <Text className="text-sm text-muted-foreground">{cl.value}</Text>
                )}
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Study material coverage */}
      {studyMaterials && studyMaterials.length > 0 && (
        <View className="mt-4 rounded-lg bg-blue-50/50 p-3 dark:bg-blue-950/20">
          <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('title.textbook_appearances')}
          </Text>
          {studyMaterials.map((m, i) => (
            <View key={i}>
              <View className="flex-row items-center gap-1.5">
                <BookOpen size={14} color={ICON_MUTED} />
                <Text className="text-xs font-medium text-blue-700 dark:text-blue-300">
                  {m.material} {m.location?.book ? `Book ${m.location.book}` : ''}{m.location?.lesson ? `, Lesson ${m.location.lesson}` : ''}{m.location?.dialog ? `, Dialog ${m.location.dialog}` : ''}
                </Text>
              </View>
              {m.example && (
                <Text className="mt-1 text-sm text-foreground" lang={l2Code}>{m.example}</Text>
              )}
              {m.exampleTranslation && (
                <Text className="mt-0.5 text-sm text-muted-foreground">{m.exampleTranslation}</Text>
              )}
              {i < studyMaterials.length - 1 && <View className="my-2 h-px bg-border" />}
            </View>
          ))}
        </View>
      )}

      {/* Han script detail */}
      {entry.han_script && (entry.han_script.traditional || entry.han_script.simplified) && (
        <View className="mt-3 flex-row gap-4">
          {entry.han_script.simplified && entry.han_script.simplified !== head && entry.han_script.simplified !== alternate && (
            <Text className="text-sm text-muted-foreground">简: {entry.han_script.simplified}</Text>
          )}
          {entry.han_script.traditional && entry.han_script.traditional !== head && entry.han_script.traditional !== alternate && (
            <Text className="text-sm text-muted-foreground">繁: {entry.han_script.traditional}</Text>
          )}
        </View>
      )}

      {/* Phonetic detail extras */}
      {entry.phonetic_detail && typeof entry.phonetic_detail === 'object' && (
        <View className="mt-3 flex-row flex-wrap gap-x-4 gap-y-1">
          {Object.entries(entry.phonetic_detail).map(([key, value]) => {
            if (key === 'romaji' || key === 'pinyin' || key === 'jyutping') return null;
            if (key === 'pinyin_numeric' || key === 'kana') return null;
            if (key === 'ipa' && value === entry.pronunciation) return null;
            if (typeof value === 'string' && value) {
              return <Text key={key} className="text-xs text-muted-foreground/70">{key}: {value}</Text>;
            }
            return null;
          })}
        </View>
      )}

      {/* Source line + save button */}
      <View className="mt-4 flex-row items-center justify-between">
        {sourceLine}
        <Pressable
          onPress={toggleSave}
          className={`flex-row items-center rounded-md border px-2 py-1 ${wordSaved ? 'border-amber-500 bg-amber-500' : 'border-amber-500/50'}`}
        >
          <Bookmark size={14} color={wordSaved ? '#fff' : '#f59e0b'} fill={wordSaved ? '#fff' : 'none'} style={{ marginRight: 4 }} />
          <Text className={`text-xs ${wordSaved ? 'text-white' : 'text-amber-500/80'}`}>{wordSaved ? t('label.saved') : t('action.save_word')}</Text>
        </Pressable>
      </View>

      {/* Image Search Sheet */}
      <WebViewSheet
        visible={showImageSearch}
        url={googleImagesUrl}
        title={t('action.search_images')}
        onClose={() => setShowImageSearch(false)}
      />
    </View>
  );
}
