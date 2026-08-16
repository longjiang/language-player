import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { useRouter } from 'expo-router';
import type { DictionaryEntry, SketchThesaurusResponse } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';
import { PYTHON_API_URL } from '@/lib/api-url';
import { ICON_MUTED } from '@/lib/theme-colors';
import { ErrorNotice } from '@/components/ui/error-notice';
import { useCorpusFetch } from './use-corpus-fetch';
import { DictionaryEntryCard } from '@/components/dictionary/DictionaryEntryCard';
import { getCachedEntries, enqueueLookupWords } from '@/lib/dictionary-cache';
import { useDictionaryContext } from '@/contexts/DictionaryContext';

interface RelatedWordsProps {
  word: string;
  l2Code: string;
  l1Code?: string;
  /** Optional corpus override; null = let the backend auto-resolve. */
  corpname?: string | null;
}

/**
 * Related words (thesaurus), sorted by similarity score.
 * GET /sketch-engine/thesaurus?word=&l2=  (ARCH-020 §7.3)
 *
 * Each word renders as a compact DictionaryEntryCard whose entry is lazily
 * fetched through the shared batch lookup cache.
 */
export function RelatedWords({ word, l2Code, l1Code = 'en', corpname = null }: RelatedWordsProps) {
  const t = useT();
  const router = useRouter();
  const { setDetailHead, setSidebarSource, setCameFromSearch } = useDictionaryContext();
  const corpnameParam = corpname ? `&corpname=${encodeURIComponent(corpname)}` : '';
  const url = `${PYTHON_API_URL}/sketch-engine/thesaurus?word=${encodeURIComponent(word)}&l2=${l2Code.split('-')[0]}${corpnameParam}`;
  const { data, loading, error } = useCorpusFetch<SketchThesaurusResponse>(url);

  if (loading) {
    return (
      <View className="items-center justify-center py-10">
        <ActivityIndicator size="large" color={ICON_MUTED} />
      </View>
    );
  }

  if (error) {
    return <ErrorNotice message={t('error.failed_to_load', { status: error })} />;
  }

  if (!data || data.related.length === 0) {
    return (
      <Text className="py-6 text-center text-sm text-muted-foreground">
        {t('msg.no_related_found', { term: word })}
      </Text>
    );
  }

  const openWord = (entry: DictionaryEntry) => {
    // Surface the related-words list in the entry-page sidebar (source 'corpus').
    const base = l2Code.split('-')[0];
    const items = data.related
      .filter((related) => related.word)
      .map((related) => {
        const cached = getCachedEntries(base, related.word)?.[0];
        // Keep the clicked entry's real id so the sidebar can highlight it.
        const isCurrent = related.word === entry.head || cached?.id === entry.id;
        if (isCurrent) {
          return {
            id: entry.id,
            head: entry.head,
            dictionaryId: entry.dictionary?.id ?? 'llm',
            entryId: entry.id,
          };
        }
        return cached
          ? {
              id: cached.id,
              head: cached.head,
              dictionaryId: cached.dictionary?.id ?? 'llm',
              entryId: cached.id,
            }
          : { id: related.word, head: related.word, dictionaryId: 'unknown', entryId: related.word };
      });
    setDetailHead(entry.head);
    setSidebarSource({ kind: 'wordlist', items, currentId: entry.id, source: 'corpus' });
    setCameFromSearch(true);
    const safeId = entry.id.replace(/,/g, '~');
    router.push(`/(tabs)/(vocab)/word/${safeId}` as any);
  };

  return (
    <View className="gap-2">
      {data.related
        .filter((related) => related.word)
        .map((related, index) => (
          <RelatedWordCard
            key={`${related.word}-${index}`}
            text={related.word}
            sourceWord={word}
            l1Code={l1Code}
            l2Code={l2Code}
            onOpen={openWord}
          />
        ))}
    </View>
  );
}

/** A single related word as a compact dictionary entry card (lazily fetched). */
function RelatedWordCard({
  text,
  sourceWord,
  l1Code,
  l2Code,
  onOpen,
}: {
  text: string;
  /** The entry-page word this related word was found under (save-context source). */
  sourceWord: string;
  l1Code: string;
  l2Code: string;
  onOpen: (entry: DictionaryEntry) => void;
}) {
  const t = useT();
  const router = useRouter();
  const base = l2Code.split('-')[0];
  const [entry, setEntry] = useState<DictionaryEntry | null | undefined>(() =>
    getCachedEntries(base, text)?.[0],
  );
  const requestedRef = React.useRef(entry !== undefined);

  useEffect(() => {
    const cached = getCachedEntries(base, text);
    if (cached && cached.length > 0) {
      setEntry(cached[0]);
      return;
    }
    if (requestedRef.current) return;
    requestedRef.current = true;
    void enqueueLookupWords([{ text, l2Code: base }], PYTHON_API_URL).then(() => {
      setEntry(getCachedEntries(base, text)?.[0] ?? null);
    });
  }, [base, text]);

  if (entry === undefined) {
    return (
      <View className="flex-row items-center gap-2 rounded-lg border border-border bg-card p-3">
        <Text className="flex-1 text-lg font-bold text-muted-foreground/60" numberOfLines={1}>{text}</Text>
        <ActivityIndicator size="small" color={ICON_MUTED} />
      </View>
    );
  }

  if (!entry) {
    return (
      <Pressable
        onPress={() => router.push(`/(tabs)/(vocab)/?q=${encodeURIComponent(text)}` as any)}
        className="w-full rounded-lg border border-border bg-card p-3"
      >
        <Text className="text-lg font-bold text-foreground" numberOfLines={1}>{text}</Text>
      </Pressable>
    );
  }

  return (
    <DictionaryEntryCard
      entry={entry}
      variant="compact"
      l2Code={l2Code}
      l1Code={l1Code}
      saveContext={{ form: text, text, textTitle: t('corpus.related_to', { word: sourceWord }) }}
      onPress={() => onOpen(entry)}
    />
  );
}
