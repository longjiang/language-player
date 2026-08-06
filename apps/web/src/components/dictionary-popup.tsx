'use client';

import { useEffect, useState, useCallback, useMemo, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import type { LemmatizedToken, DictionaryEntry, SavedWordContext, SavedLexicalItemRecord, SavedLexicalItemInstance } from '@langplayer/shared';
import { normalizeInstances } from '@/hooks/use-saved-words';
import { Loader2, X, AlertCircle, AlertTriangle, ExternalLink } from 'lucide-react';
import { DictionaryEntryCard } from './dictionary-entry-card';
import { AiExplanation } from './ai-explanation';
import { SaveButton } from './save-button';
import { ImageSearchResults } from './dictionary/image-search-results';
import { useT } from '@/hooks/use-t';
import { useSavedWordsContext } from '@/providers/saved-words-provider';
import { removeCardFromStorage } from '@/hooks/use-srs';
import { baseCode } from '@/lib/language-data';
import { formatPronunciation } from '@langplayer/utils';
import { PYTHON_API_URL } from '@/lib/api-url';
import { log, logwarn } from '@/lib/logger';
import { getCachedEntries, setCachedEntries, subscribeToCache, getL1CachedEntries, setL1CachedEntry } from '@/lib/dictionary-cache';
import { lookupL1Text } from '@/lib/l1-lookup';
import { WordList } from '@/components/dictionary/word-list';
import { buildEntryRoute } from '@/lib/entry-route';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

interface DictionaryPopupProps {
  token: LemmatizedToken;
  l1Code: string;
  l2Code: string;
  /** Viewport rect of the token that opened the popup — the dialog's enter
   *  animation originates from this span. */
  position?: { x: number; y: number; width?: number; height?: number };
  /** Context for word saving (subtitle line, video title, etc.) */
  context?: SavedWordContext;
  /** Optional link from the block this token belongs to — offered as the first
   *  action in the popup so users can open the source page in the web reader. */
  linkUrl?: string;
  /** Custom handler for the link action (e.g. navigate inside an EPUB).
   *  Defaults to opening the URL in the web reader. */
  onOpenLink?: (href: string) => void;
  /** When true (text-selection popup), also call /extract-phrases on the token
   *  text and render canonical dictionary cards for each extracted phrase,
   *  alongside whatever the standard lookup returns. */
  extractPhrases?: boolean;
  onClose: () => void;
}

/** Fetches dictionary entries for a token and displays them in a popover. */
export function DictionaryPopup({
  token,
  l1Code,
  l2Code,
  position,
  context,
  linkUrl,
  onOpenLink,
  extractPhrases = false,
  onClose,
}: DictionaryPopupProps) {
  const router = useRouter();
  const t = useT();
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { savedWords, removeSavedWord } = useSavedWordsContext();
  const [dialogOpen, setDialogOpen] = useState(true);

  // Re-resolve saved words from the dictionary cache whenever it populates
  // (e.g. the review page pre-fetches the saved entry for the current card).
  const [cacheVersion, setCacheVersion] = useState(0);
  useEffect(() => subscribeToCache(() => setCacheVersion((v) => v + 1)), []);

  // Diagnostic: log the inputs whenever a dictionary popup opens, so lookup /
  // saved-word ID mismatches can be traced from the console.
  useEffect(() => {
    log('Dictionary popup opened', { text: token.text, token, context, l2Code });
    // Mount-only: the popup's inputs are fixed for its lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Spawn-point animation: pin the enter transform so the dialog's center
  // starts at the clicked token's center, then settles into viewport center
  // (the shared DialogContent already pins -50% translate for a plain fade).
  const enterOriginStyle = useMemo<CSSProperties | undefined>(() => {
    if (!position || typeof window === 'undefined') return undefined;
    const cx = position.x + (position.width ?? 0) / 2;
    const cy = position.y + (position.height ?? 0) / 2;
    return {
      '--tw-enter-translate-x': `${cx - window.innerWidth / 2}px`,
      '--tw-enter-translate-y': `${cy - window.innerHeight / 2}px`,
      '--tw-enter-scale': '0.9',
      animationDuration: '200ms',
    } as CSSProperties;
  }, [position]);

  const lookupWord = useCallback(async (text: string, signal: AbortSignal) => {
    try {
      const res = await fetch(`${PYTHON_API_URL}/dictionary/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, l2: baseCode(l2Code), l1: l1Code }),
        signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return (data.results ?? []) as DictionaryEntry[];
    } catch {
      return [];
    }
  }, [l1Code, l2Code]);

  // ── Phrase extraction (selection popup) ──
  // Ask the LLM for the canonical forms of the main words/phrases in the
  // selected snippet, then look each phrase up through the standard dictionary
  // lookup and render entry cards for whatever comes back.
  const [phraseCards, setPhraseCards] = useState<DictionaryEntry[]>([]);
  const [phraseLoading, setPhraseLoading] = useState(false);
  const [phrasePronunciation, setPhrasePronunciation] = useState<string | null>(null);

  useEffect(() => {
    if (!extractPhrases || !token.text.trim()) return;
    let cancelled = false;
    const controller = new AbortController();
    setPhraseLoading(true);

    const run = async () => {
      try {
        const res = await fetch(`${PYTHON_API_URL}/extract-phrases`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: token.text, lang: baseCode(l2Code) }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;

        const phrases = Array.isArray(data?.phrases)
          ? (data.phrases as unknown[]).filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
          : [];
        if (typeof data?.pronunciation === 'string' && data.pronunciation.trim()) {
          setPhrasePronunciation(data.pronunciation);
        }
        if (phrases.length === 0) return;

        const results: DictionaryEntry[] = [];
        for (const phrase of phrases) {
          if (cancelled) break;
          const cached = getCachedEntries(l2Code, phrase);
          if (cached && cached.length > 0) {
            results.push(...cached);
            continue;
          }
          const found = await lookupWord(phrase, controller.signal);
          if (cancelled) break;
          if (found.length > 0) {
            setCachedEntries(l2Code, phrase, found);
            results.push(...found);
          }
        }

        if (!cancelled) {
          const seen = new Set<string>();
          setPhraseCards(
            results.filter((e) => {
              if (seen.has(e.id)) return false;
              seen.add(e.id);
              return true;
            }),
          );
        }
      } catch (err: any) {
        if (!cancelled && err?.name !== 'AbortError') {
          logwarn('Phrase extraction failed', { text: token.text.slice(0, 80), error: err?.message ?? String(err) });
        }
      } finally {
        if (!cancelled) setPhraseLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [extractPhrases, token.text, l2Code, lookupWord]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setError(null);

    const search = async () => {
      const texts = [
        ...token.lemmas.map((l) => l.lemma),
        token.text,
      ].filter((t, i, a) => a.indexOf(t) === i);

      const allEntries: DictionaryEntry[] = [];
      let cacheHit = false;

      // ── Check cache first ──
      for (const text of texts) {
        const cached = getCachedEntries(l2Code, text);
        if (cached && cached.length > 0) {
          for (const e of cached) {
            if (!e.match_type) {
              e.match_type = text === token.text ? 'exact' : 'lemma';
            }
          }
          allEntries.push(...cached);
          cacheHit = true;
          break; // use first matching cached result
        }
      }

      // ── Cache miss: fetch from server ──
      if (!cacheHit) {
        setLoading(true);
        for (const text of texts) {
          if (cancelled) break;
          const results = await lookupWord(text, controller.signal);
          if (!cancelled) {
            for (const e of results) {
              if (!e.match_type) {
                e.match_type = text === token.text ? 'exact' : 'lemma';
              }
            }
            // Cache the results for future use
            if (results.length > 0) {
              setCachedEntries(l2Code, text, results);
              // lookupWord always sends l1 — when non-English, the results are
              // already L1-translated; index them by id so the review back
              // side reuses the exact same translation.
              if (l1Code !== 'en') {
                for (const e of results) setL1CachedEntry(baseCode(l2Code), l1Code, e);
              }
            }
            allEntries.push(...results);
          }
          if (allEntries.length > 0) break;
        }
      }

      if (!cancelled) {
        const seen = new Set<string>();
        const deduped = allEntries.filter((e) => {
          if (seen.has(e.id)) return false;
          seen.add(e.id);
          return true;
        });
        setEntries(deduped);
        setLoading(false);
      }

      // ── Cache hit + non-English L1: fetch L1-translated definitions in background ──
      // Batch lookup returns English-only definitions for speed. When the user
      // clicks a word and their L1 is not English, fetch translated definitions
      // and replace the displayed entries once they arrive.
      if (cacheHit && l1Code !== 'en' && !cancelled) {
        // Reuse L1-translated entries already fetched (e.g. by the review back
        // side) — keyed by entry id, so the same entry's definitions are
        // translated only once instead of on every lookup.
        const l2 = baseCode(l2Code);
        const currentIds = allEntries.map((e) => e.id).filter(Boolean);
        const cachedL1 = getL1CachedEntries(l2, l1Code, currentIds);
        if (cachedL1.length > 0) {
          const cachedL1Ids = new Set(cachedL1.map((e) => e.id));
          setEntries([
            ...cachedL1,
            ...allEntries.filter((e) => !cachedL1Ids.has(e.id)),
          ]);
        } else {
          // lookupL1Text dedupes concurrent fetches (the review back side
          // shares this path) and caches every result by entry id.
          for (const text of texts) {
            if (cancelled) break;
            const results = await lookupL1Text(text, l2Code, l1Code);
            if (cancelled || results.length === 0) continue;
            // Swap in L1-translated versions of the displayed entries; keep any
            // entry the lookup didn't translate.
            const byId = new Map(results.map((e) => [e.id, e]));
            setEntries(allEntries.map((e) => byId.get(e.id) ?? e));
            break;
          }
        }
      }
    };

    search().catch((err) => {
      if (!cancelled && err.name !== 'AbortError') {
        setError(err?.message ?? 'Lookup failed');
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [token, lookupWord, l2Code]);

  // IDs loaded for this token: the standard lookup results plus any phrase
  // cards. A word saved from the /extract-phrases "Phrases" section carries the
  // ID of its canonical phrase entry, which only appears in phraseCards — not
  // in the standard lookup results for the selected surface form. Without it,
  // freshly saved phrase words would be flagged as unrecognized legacy data.
  const entryIds = useMemo(
    () => new Set([...entries, ...phraseCards].map((e) => e.id)),
    [entries, phraseCards],
  );

  // Saved words whose forms include the token text but whose ID isn't among
  // the loaded entries — the pool that could be flagged as unrecognized.
  const formMatchingSavedWords = useMemo(() => {
    const langWords = savedWords[l2Code] ?? [];
    return langWords.filter((sw) => {
      const formMatch = sw.forms.some(
        (f) => f.toLowerCase() === token.text.toLowerCase()
      );
      return formMatch && !entryIds.has(sw.id);
    });
  }, [savedWords, l2Code, entryIds, token.text]);

  // A form-matching saved word is often missed by the standard lookup when the
  // clicked surface is an ambiguous reading (e.g. kana しのぎ vs the saved kanji
  // entry 鎬). Resolve the saved word's own entry from the dictionary cache —
  // callers like the review page pre-fetch the saved entry — so it's shown in
  // the popup and NOT flagged as unrecognized legacy data.
  const resolvedSavedEntries = useMemo(() => {
    if (formMatchingSavedWords.length === 0) return [];
    const base = baseCode(l2Code);
    const out: DictionaryEntry[] = [];
    const resolved = new Set<string>();
    for (const sw of formMatchingSavedWords) {
      if (resolved.has(sw.id)) continue;
      const forms = new Set([token.text, ...token.lemmas.map((l) => l.lemma), ...sw.forms]);
      for (const form of forms) {
        if (!form.trim()) continue;
        const cached = getCachedEntries(base, form);
        const entry = cached?.find((e) => e.id === sw.id);
        if (entry) {
          resolved.add(sw.id);
          out.push(entry);
          break;
        }
      }
    }
    return out;
  }, [formMatchingSavedWords, token.text, token.lemmas, l2Code, cacheVersion]);

  // Find saved words for this token whose IDs don't match any loaded entry —
  // only words that couldn't be resolved via the cache are truly unrecognized.
  const unmatchedSavedWords = useMemo(() => {
    if (loading || error) return [];
    const resolvedIds = new Set(resolvedSavedEntries.map((e) => e.id));
    return formMatchingSavedWords.filter((sw) => !resolvedIds.has(sw.id));
  }, [loading, error, formMatchingSavedWords, resolvedSavedEntries]);

  // Diagnostic: when a saved word is flagged as unrecognized, log the ID sets
  // involved so an ID-scheme mismatch can be traced (saved id vs. the ids the
  // standard lookup and phrase extraction loaded for this token).
  useEffect(() => {
    if (unmatchedSavedWords.length === 0) return;
    logwarn('Unmatched saved word vs loaded entries', {
      tokenText: token.text,
      saved: unmatchedSavedWords.map((sw) => ({
        id: sw.id,
        forms: sw.forms,
        formMatch: sw.forms.some((f) => f.toLowerCase() === token.text.toLowerCase()),
      })),
      standardEntryIds: entries.map((e) => e.id),
      phraseCardIds: phraseCards.map((e) => e.id),
    });
  }, [unmatchedSavedWords, token.text, entries, phraseCards]);

  // Phrase cards that aren't duplicates of the standard lookup results.
  const mainEntryIds = useMemo(() => new Set(entries.map((e) => e.id)), [entries]);
  const visiblePhraseCards = useMemo(
    () => phraseCards.filter((e) => !mainEntryIds.has(e.id)),
    [phraseCards, mainEntryIds],
  );

  const handleEntryClick = (entry: DictionaryEntry) => {
    router.push(buildEntryRoute(l1Code, l2Code, entry.dictionary?.id ?? 'llm', entry.id));
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) { setDialogOpen(false); setTimeout(onClose, 200); } }}>
      <DialogContent
        showCloseButton={false}
        className="w-[28rem] max-w-[90vw] sm:max-w-[28rem] p-4 gap-1"
        style={enterOriginStyle}
      >
        <DialogTitle className="sr-only">{t('title.dictionary')}</DialogTitle>
        {/* Header */}
        <div className="mb-1 flex items-center justify-between">
          <div>
            <span className="text-xl font-bold">{token.text}</span>
            {token.pronunciation && (
              <span className="ml-2 text-sm text-muted-foreground">
                [{token.pronunciation}]
              </span>
            )}
            {!token.pronunciation && phrasePronunciation && (
              <span className="ml-2 text-sm text-muted-foreground">
                [{phrasePronunciation}]
              </span>
            )}
            {token.lemmas.length > 0 && token.lemmas[0]!.lemma !== token.text && (
              <div className="text-xs text-muted-foreground">
                {t('label.lemma')}: {token.lemmas.map((l) => l.lemma).join(', ')}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[50vh] overflow-y-auto space-y-3">
          {linkUrl && (
            <button
              type="button"
              onClick={() => {
                if (onOpenLink) onOpenLink(linkUrl);
                else router.push(`/${l1Code}/${l2Code}/web-reader?url=${encodeURIComponent(linkUrl)}`);
              }}
              className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-muted"
            >
              <ExternalLink className="h-4 w-4" />
              {t('action.open_in_reader')}
            </button>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {!loading && !error && entries.length === 0 && visiblePhraseCards.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <p>{t('msg.no_dictionary_entry', { word: token.text })}</p>
              {token.lemmas.length > 0 && (
                <p className="mt-1 text-xs">
                  {t('msg.tried_lemmas')}: {token.lemmas.map((l) => l.lemma).join(', ')}
                </p>
              )}
            </div>
          )}

          {/* AI Explanation — placed above dictionary entries, matching Classic */}
          <AiExplanation
            word={token.text}
            contextText={context?.text}
            entryFound={entries.length > 0}
          />

          {/* Compact image strip — one scrolling row, 3 images per query */}
          <ImageSearchResults
            variant="compact"
            term={token.text}
            l2Code={l2Code}
            l1Code={l1Code}
            definition={entries[0]?.definitions?.[0]}
            contextText={context?.text}
            contextForm={context?.form ?? token.text}
          />

          {/* Canonical phrase cards from /extract-phrases (selection popup) */}
          {extractPhrases && (phraseLoading || visiblePhraseCards.length > 0) && (
            <div className="pt-1">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">{t('label.phrases')}</span>
                {phraseLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              {!phraseLoading && (
                <WordList>
                  {visiblePhraseCards.map((entry) => (
                    <DictionaryEntryCard
                      key={entry.id}
                      entry={entry}
                      onClick={handleEntryClick}
                      saveContext={context}
                      pronunciation={formatPronunciation(entry, l2Code)}
                      l2Code={l2Code}
                    />
                  ))}
                </WordList>
              )}
            </div>
          )}

          {/* Unrecognized saved words (Tier 2 — legacy data) */}
          {!loading && unmatchedSavedWords.length > 0 && unmatchedSavedWords.map((sw) => (
            <div
              key={sw.id}
              className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    {t('msg.unrecognized_saved_word')}
                  </p>
                  <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
                    <strong>{sw.forms.join(', ')}</strong>
                    {(() => {
                      const insts = normalizeInstances(sw);
                      const ctx = insts[insts.length - 1]?.context;
                      return ctx?.text ? (
                        <> — {t('msg.saved_from_context')} &ldquo;{ctx.text.slice(0, 80)}{ctx.text.length > 80 ? '…' : ''}&rdquo;</>
                      ) : null;
                    })()}
                  </p>
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    {t('msg.unrecognized_saved_word_desc', { id: sw.id })}
                  </p>
                  <div className="mt-2">
                    <button
                      onClick={() => {
                        removeSavedWord(l2Code, sw.id);
                        removeCardFromStorage(l2Code, sw.id);
                      }}
                      className="inline-flex items-center gap-1 rounded bg-amber-200 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-300 dark:bg-amber-800 dark:text-amber-200 dark:hover:bg-amber-700 transition-colors"
                    >
                      {t('action.remove_and_resave')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          <WordList className="space-y-3">
            {/* Saved words resolved from cache for an ambiguous surface reading
                (e.g. kana しのぎ → saved kanji 鎬) come first. */}
            {resolvedSavedEntries.map((entry) => (
              <DictionaryEntryCard
                key={entry.id}
                entry={entry}
                onClick={handleEntryClick}
                saveContext={context}
                pronunciation={formatPronunciation(entry, l2Code)}
                l2Code={l2Code}
              />
            ))}
            {entries.map((entry) => (
              <DictionaryEntryCard
                key={entry.id}
                entry={entry}
                onClick={handleEntryClick}
                saveContext={context}
                pronunciation={formatPronunciation(entry, l2Code)}
                l2Code={l2Code}
              />
            ))}
          </WordList>

          {loading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
