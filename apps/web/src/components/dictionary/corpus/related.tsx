'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DictionaryEntry, SavedWordContext, SketchThesaurusResponse } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';
import { useGlyphLang } from '@/hooks/use-glyph-lang';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import { buildEntryRouteWithList, entryToNavItem, setWordListNav } from '@/lib/word-list-navigation';
import { enqueueLookupWords, getCachedEntries } from '@/lib/dictionary-cache';
import { Loader2, AlertCircle } from 'lucide-react';
import { useCorpusFetch } from './use-corpus-fetch';
import { DictionaryEntryCard } from '@/components/dictionary-entry-card';
import { WordList } from '@/components/dictionary/word-list';

interface RelatedWordsProps {
  word: string;
  l2Code: string;
  /** ISO 639-1 code of the user's L1 (for card pronunciation + routing). */
  l1Code?: string;
  /** Optional corpus override; null = let the backend auto-resolve. */
  corpname?: string | null;
}

/**
 * Related words (thesaurus), sorted by similarity score.
 * GET /sketch-engine/thesaurus?word=&l2=  (ARCH-020 §7.3)
 *
 * Rendered as an infinite-scroll grid like the saved-words page: each word is
 * a compact DictionaryEntryCard whose entry is lazily fetched (through the
 * shared batch lookup cache) when the card nears the viewport.
 */
export function RelatedWords({ word, l2Code, l1Code = 'en', corpname = null }: RelatedWordsProps) {
  const t = useT();
  const router = useRouter();
  const corpnameParam = corpname ? `&corpname=${encodeURIComponent(corpname)}` : '';
  const url = `${PYTHON_API_URL}/sketch-engine/thesaurus?word=${encodeURIComponent(word)}&l2=${baseCode(l2Code)}${corpnameParam}`;
  const { data, loading, error } = useCorpusFetch<SketchThesaurusResponse>(url);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        {t('error.failed_to_load', { status: error })}
      </div>
    );
  }

  if (!data || data.related.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {t('msg.no_related_found', { term: word })}
      </p>
    );
  }

  // Opening a related word surfaces this related-words list in the entry-page
  // sidebar, like search results and saved words do. Words that haven't been
  // resolved to an entry yet fall back to a dictionary search when clicked.
  const handleOpenWord = (entry: DictionaryEntry) => {
    const items = data.related
      .filter((related) => related.word)
      .map((related) => {
        const cached = getCachedEntries(baseCode(l2Code), related.word)?.[0];
        return cached
          ? entryToNavItem(cached)
          : { head: related.word, dictionaryId: 'unknown', entryId: related.word, id: related.word };
      });
    const item = entryToNavItem(entry);
    setWordListNav(items, item.id, 'corpus');
    router.push(buildEntryRouteWithList(l1Code, l2Code, item.dictionaryId, item.entryId, item.id));
  };

  return (
    <WordList layout="grid">
      {/* Same column logic as the Collocations section: 1 column, then 2 at sm+. */}
      {data.related
        .filter((related) => related.word)
        .map((related, index) => (
          <RelatedWordCard
            key={`${related.word}-${index}`}
            text={related.word}
            sourceWord={word}
            l1Code={l1Code}
            l2Code={l2Code}
            onOpen={handleOpenWord}
          />
        ))}
    </WordList>
  );
}

/**
 * A single related word as a compact dictionary entry card. The entry is
 * fetched lazily (shared batch lookup cache) when the card nears the
 * viewport, mirroring SavedWordEntryCard. Unresolvable words fall back to a
 * clickable head-only card that opens a dictionary search.
 */
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
  /** Open this resolved entry (also surfaces the related-words list in the sidebar). */
  onOpen: (entry: DictionaryEntry) => void;
}) {
  const router = useRouter();
  const t = useT();
  const base = baseCode(l2Code);
  const glyphLang = useGlyphLang(l2Code);
  const [entry, setEntry] = useState<DictionaryEntry | null | undefined>(() =>
    getCachedEntries(base, text)?.[0],
  );
  const sentinelRef = useRef<HTMLDivElement>(null);
  const requestedRef = useRef(entry !== undefined);

  useEffect(() => {
    const cached = getCachedEntries(base, text);
    if (cached && cached.length > 0) {
      setEntry(cached[0]);
      return;
    }
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting && !requestedRef.current) {
          requestedRef.current = true;
          void enqueueLookupWords([{ text, l2Code: base }], PYTHON_API_URL).then(() => {
            setEntry(getCachedEntries(base, text)?.[0] ?? null);
          });
          observer.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [base, text]);

  // Still loading — fetch not yet triggered or in flight.
  if (entry === undefined) {
    return (
      <div ref={sentinelRef} className="rounded-lg border bg-card p-3 text-sm shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-muted-foreground/60">{text}</span>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // No resolvable entry — show the word itself, clickable to search.
  if (!entry) {
    return (
      <div
        className="cursor-pointer rounded-lg border bg-card p-3 text-sm shadow-sm transition-colors hover:bg-muted/30"
        onClick={() => router.push(`/${l1Code}/${l2Code}/dictionary?q=${encodeURIComponent(text)}`)}
        lang={glyphLang}
      >
        <span className="text-lg font-bold text-foreground">{text}</span>
      </div>
    );
  }

  // Saving a related word records its source as "Corpus - Related to '<entry word>'".
  const saveContext: SavedWordContext = {
    form: text,
    text,
    textTitle: t('corpus.related_to', { word: sourceWord }),
  };

  return (
    <DictionaryEntryCard
      entry={entry}
      variant="compact"
      l2Code={l2Code}
      l1Code={l1Code}
      saveContext={saveContext}
      onClick={() => onOpen(entry)}
    />
  );
}
