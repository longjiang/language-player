/**
 * DictionaryCard — Web-parity dictionary lookup card for the extension.
 *
 * Mirrors apps/web's DictionaryPopup + DictionaryEntryCard:
 * - Only the head word navigates to the entry detail page (headOnlyLink), the
 *   rest of the card never navigates.
 * - Loading renders compact entry-card skeletons (not a spinner) so the popup's
 *   shape and fixed top stay stable.
 * - Entries from the shared batch cache render instantly (even for l1 ≠ en),
 *   then hot-swap to L1-translated cards once they arrive.
 * - Supports the collapsible "Context sentence" card and a "Search images" link.
 * - Save/bookmark gated on auth, matching web's redirect-to-login behaviour.
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import type { LemmatizedToken, DictionaryEntry, SavedWordContext } from '@langplayer/shared';
import { formatProficiencyLevel, primaryScale, shouldShowLevel, isHanLanguage, glyphLangTag } from '@langplayer/shared';
import { baseCode, formatPronunciation, getCachedEntries, setCachedEntries, getL1CachedEntries, setL1CachedEntry, subscribeToCache } from '@langplayer/utils';
import { useSavedWords } from './SavedWordsProvider';
import { API_BASE } from '../api-config';
import { fetchInflectedForms } from '../saved-words';
import { apiFetch } from '../api-fetch';
import { Markdown } from './Markdown';
import { Bookmark, BookmarkCheck, ChevronDown, ChevronUp, Image, Loader, Sparkles, Volume2, X } from './Icons';
import { Button } from './ui/button';
import { log, logwarn, logerr, t } from '../i18n';

// ── Types ──────────────────────────────────────────────────────────────────

interface DictionaryCardProps {
  token: LemmatizedToken;
  l1Code: string;
  l2Code: string;
  /** Human-readable L1 name (e.g., "English", "日本語") */
  l1Name?: string;
  /** Human-readable L2 name (e.g., "Japanese", "français") */
  l2Name?: string;
  /** The full subtitle/page line text — used as save context + context sentence. */
  contextText?: string;
  /** Start time of the cue (seconds), used as save context. */
  cueStartTime?: number;
  /** Video/page title, used as save context. */
  videoTitle?: string;
  /** Page URL, used to extract platform/video ID for save context. */
  pageUrl?: string;
  /** URL of the hyperlink containing the selected token, if any. */
  linkUrl?: string | null;
  /** Navigate to the selected hyperlink without treating the card click as an entry click. */
  onFollowLink?: (href: string) => void;
  /** Subscription state from the parent transcript app (ADR-0034). */
  isPro: boolean;
  subLoading: boolean;
  onClose: () => void;
}

// ── API ────────────────────────────────────────────────────────────────────

const WEB_APP = 'https://languageplayer.io';
type FollowUpKind = 'inflection' | 'morphemes' | 'etymology' | 'syntax' | 'synonyms' | 'examples';
const FOLLOW_UPS: Array<{ kind: FollowUpKind; labelKey: string }> = [
  { kind: 'inflection', labelKey: 'inflection' },
  { kind: 'morphemes', labelKey: 'morphemes' },
  { kind: 'etymology', labelKey: 'etymology' },
  { kind: 'syntax', labelKey: 'syntax' },
  { kind: 'synonyms', labelKey: 'synonyms' },
  { kind: 'examples', labelKey: 'examples' },
];

async function fetchEntries(
  text: string,
  l2Code: string,
  l1Code: string,
  signal: AbortSignal,
): Promise<DictionaryEntry[]> {
  const res = await apiFetch(`${API_BASE}/dictionary/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, l2: baseCode(l2Code), l1: l1Code }),
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.results ?? []) as DictionaryEntry[];
}

/** Extract a YouTube video ID from a URL if present. */
function extractYoutubeId(url: string): string | undefined {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m?.[1];
}

// ── Loading skeleton (matches apps/web DictionaryEntryCardSkeleton) ─────────

function EntryCardSkeleton() {
  return (
    <div className="lpv-dict-skeleton" aria-busy="true" aria-hidden="true">
      <div className="lpv-dict-skeleton-head">
        <span className="lpv-dict-skeleton-bar" style={{ width: '6rem' }} />
        <span className="lpv-dict-skeleton-bar" style={{ width: '4rem' }} />
        <span className="lpv-dict-skeleton-badge" />
      </div>
      <div className="lpv-dict-skeleton-defs">
        <span className="lpv-dict-skeleton-bar" style={{ width: '100%' }} />
        <span className="lpv-dict-skeleton-bar" style={{ width: '80%' }} />
        <span className="lpv-dict-skeleton-bar" style={{ width: '66%' }} />
      </div>
      <div className="lpv-dict-skeleton-foot">
        <span className="lpv-dict-skeleton-bar" style={{ width: '5rem' }} />
        <span className="lpv-dict-skeleton-btn" />
      </div>
    </div>
  );
}

// ── Collapsible context sentence (matches apps/web ContextSentenceCard) ─────

interface ContextCardProps {
  contextText: string;
  l1Code: string;
  l2Code: string;
}

function ContextSentenceCard({ contextText, l1Code, l2Code }: ContextCardProps) {
  const [open, setOpen] = useState(false);
  const [translation, setTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const fetchedRef = useRef(false);

  const canTranslate = baseCode(l1Code) !== baseCode(l2Code);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !fetchedRef.current && canTranslate) {
      fetchedRef.current = true;
      setTranslating(true);
      apiFetch(`${API_BASE}/translate_array`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: [contextText], l1: l1Code, l2: l2Code }),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const value = Array.isArray(data.translated_texts) ? data.translated_texts[0] : undefined;
          setTranslation(value && value !== contextText ? value : null);
        })
        .catch((err: any) => {
          logwarn('[DICT] context translation failed', { message: err?.message });
          setTranslation(null);
        })
        .finally(() => setTranslating(false));
    }
  };

  return (
    <div className="lpv-dict-context">
      <button type="button" onClick={toggle} className="lpv-dict-context-toggle" aria-expanded={open}>
        <span>{t('contextSentence')}</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="lpv-dict-context-body">
          <p className="lpv-dict-context-l2" dir="auto">{contextText}</p>
          {canTranslate && (translating ? (
            <span className="lpv-dict-context-loading"><Loader size={12} /> {t('translating')}</span>
          ) : translation ? (
            <p className="lpv-dict-context-l1">{translation}</p>
          ) : null)}
        </div>
      )}
    </div>
  );
}

// ── Entry card (head-only link, matches apps/web compact DictionaryEntryCard) ─

interface EntryRowProps {
  entry: DictionaryEntry;
  l1Code: string;
  l2Code: string;
  tokenForm: string;
  contextText?: string;
  cueStartTime?: number;
  videoTitle?: string;
  pageUrl?: string;
}

const EntryRow: React.FC<EntryRowProps> = React.memo(({ entry, l1Code, l2Code, tokenForm, contextText, cueStartTime, videoTitle, pageUrl }) => {
  const { savedWords, saveWord, removeSavedWord, isLoggedIn, loading: wordsLoading } = useSavedWords();
  const [saving, setSaving] = useState(false);

  const dictId = entry.dictionary?.id ?? 'llm';
  const listCurrent = `${dictId}-${entry.id}`;
  const webAppUrl = `${WEB_APP}/${encodeURIComponent(l1Code)}/${encodeURIComponent(l2Code)}/dictionary/entry/${encodeURIComponent(dictId)}/${encodeURIComponent(entry.id)}?listCurrent=${encodeURIComponent(listCurrent)}`;
  const l2Base = baseCode(l2Code);
  const formattedPronunciation = formatPronunciation(entry, l2Base);
  const levelBadges = (entry.levels ?? [])
    .filter((level) => level.numeric != null && shouldShowLevel(level, l2Base))
    .map((level) => formatProficiencyLevel(level, primaryScale(l2Base)));

  // ── Alternate script display (matches apps/web useScriptPreference) ──────
  const [useTraditional, setUseTraditional] = useState(false);
  useEffect(() => {
    chrome.storage.local.get('useTraditional').then((result) => {
      setUseTraditional(result.useTraditional === true);
    }).catch(() => {});
  }, []);
  const isHanScript = l2Base === 'vi' || l2Base === 'ko';
  const isChinese = isHanLanguage(l2Base);
  const glyphLang = glyphLangTag(l2Base, useTraditional);
  let displayHead = entry.head;
  let displayAlternate: string | null = entry.alternate ?? null;
  if (useTraditional && isChinese && displayAlternate && displayAlternate !== displayHead) {
    const swapped = displayHead;
    displayHead = displayAlternate;
    displayAlternate = swapped;
  }
  if (isHanScript && entry.han_script?.han) {
    displayAlternate = entry.han_script.han;
  } else if (!(isChinese && displayAlternate && displayAlternate !== displayHead)) {
    displayAlternate = null;
  }

  const isSaved = isLoggedIn && (savedWords[l2Code] || []).some(w => w.id === entry.id);

  const handleSave = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    // Web parity: a save needs an account. Log it so "save does nothing" is
    // diagnosable, and let the optimistic store update + PUT run when authed.
    if (wordsLoading) {
      logwarn('[SAVE] click ignored while saved-words still loading');
      return;
    }
    if (!isLoggedIn) {
      log('[SAVE] not logged in — save skipped (no network request)');
      return;
    }

    setSaving(true);
    try {
      if (isSaved) {
        await removeSavedWord(l2Code, entry.id);
      } else {
        const allForms = await fetchInflectedForms(entry.head, l2Code);
        const youtubeId = pageUrl ? extractYoutubeId(pageUrl) : undefined;
        const record = {
          id: entry.id,
          forms: allForms,
          date: Date.now(),
          context: {
            form: tokenForm,
            text: contextText || tokenForm,
            textTitle: document.title,
            starttime: cueStartTime,
            youtube_id: youtubeId,
            videoTitle,
          } as SavedWordContext,
          instances: [{
            timestamp: Date.now(),
            form: tokenForm,
            context: {
              form: tokenForm,
              text: contextText || tokenForm,
              textTitle: document.title,
              starttime: cueStartTime,
              youtube_id: youtubeId,
              videoTitle,
            } as SavedWordContext,
          }],
        };
        log('[SAVE] saving word:', JSON.stringify(record, null, 2));
        await saveWord(l2Code, record as any);
      }
    } catch (err: any) {
      logerr('[SAVE] save failed', err?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  }, [entry, isLoggedIn, wordsLoading, isSaved, l2Code, tokenForm, contextText, cueStartTime, videoTitle, pageUrl, saveWord, removeSavedWord]);

  const handleSpeak = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    window.speechSynthesis?.cancel();
    const utterance = new SpeechSynthesisUtterance(displayHead);
    utterance.lang = l2Base;
    utterance.rate = 0.75;
    window.speechSynthesis?.speak(utterance);
  }, [displayHead, l2Base]);

  const openEntry = useCallback(() => {
    window.open(webAppUrl, '_blank', 'noopener,noreferrer');
  }, [webAppUrl]);

  return (
    <div className="lpv-dict-entry-row lpv-dict-entry-card">
      <div className="lpv-dict-entry">
        <div className="lpv-dict-entry-header">
          {/* Head word is the ONLY link to the detail page (web headOnlyLink). */}
          <button
            type="button"
            className="lpv-dict-head lpv-dict-head-link"
            lang={glyphLang}
            title={t('openInDictionary')}
            onClick={(e) => { e.stopPropagation(); openEntry(); }}
          >
            {displayHead}
          </button>
          {displayAlternate && (
            <span className="lpv-dict-alternate" lang={glyphLang}>{displayAlternate}</span>
          )}
          <button className="lpv-dict-speak" type="button" onClick={handleSpeak} title={t('speak')} aria-label={t('speak')}>
            <Volume2 size={14} />
          </button>
          {formattedPronunciation && (
            <span className="lpv-dict-pron-small">{formattedPronunciation}</span>
          )}
          {levelBadges.length > 0 && (
            <span className="lpv-dict-entry-badges">
              {levelBadges.map((level, i) => (
                <span key={i} className="lpv-dict-level">{level.short}</span>
              ))}
            </span>
          )}
        </div>
        {(entry.part_of_speech || entry.definitions?.length) && (
          <div className="lpv-dict-def">
            {entry.part_of_speech && <em>{entry.part_of_speech}</em>}
            {entry.definitions?.map((definition, index) => (
              <span key={index}>{entry.part_of_speech || index > 0 ? '  ' : ''}<strong>{index + 1}</strong> {definition}</span>
            ))}
          </div>
        )}
        <div className="lpv-dict-entry-footer">
          <div className="lpv-dict-entry-footer-left">
            <span className="lpv-dict-source">{entry.dictionary?.name ?? entry.source ?? ''}</span>
            <a
              href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(entry.head)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="lpv-dict-images-link"
              onClick={(event) => event.stopPropagation()}
            >
              <Image size={12} /> {t('searchImages')}
            </a>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || wordsLoading}
            className={`lpv-entry-save-btn ${isSaved ? 'lpv-entry-save-btn-saved' : ''}`}
            title={isSaved ? t('removeFromSaved') : t('save')}
            aria-label={isSaved ? t('removeFromSaved') : t('save')}
          >
            {saving ? <Loader size={14} /> : isSaved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
            <span className="lpv-entry-save-label">{isSaved ? t('saved') : t('save')}</span>
          </button>
        </div>
      </div>
    </div>
  );
});
EntryRow.displayName = 'EntryRow';

// ── Main Card ──────────────────────────────────────────────────────────────

export const DictionaryCard: React.FC<DictionaryCardProps> = ({
  token,
  l1Code,
  l2Code,
  l1Name,
  l2Name,
  contextText,
  cueStartTime,
  videoTitle,
  pageUrl,
  linkUrl,
  onFollowLink,
  isPro,
  subLoading,
  onClose,
}) => {
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { savedWords, saveWord, removeSavedWord, isLoggedIn } = useSavedWords();

  // ── Explain state ──
  const [explainText, setExplainText] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [showExplain, setShowExplain] = useState(false);
  const [followUpLoading, setFollowUpLoading] = useState<FollowUpKind | null>(null);
  const [usedFollowUps, setUsedFollowUps] = useState<FollowUpKind[]>([]);
  const [cacheVersion, setCacheVersion] = useState(0);

  useEffect(() => subscribeToCache(() => setCacheVersion((v) => v + 1)), []);
  // Surface a cacheVersion bump re-render (e.g. an L1 entry arriving from
  // another surface) without re-fetching.
  void cacheVersion;

  // DeepSeek responses are per-word — never carry them over to a new lookup.
  useEffect(() => {
    setExplainText(null);
    setExplainError(null);
    setExplainLoading(false);
    setShowExplain(false);
    setFollowUpLoading(null);
    setUsedFollowUps([]);
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setEntries([]);

    log('Dictionary lookup for:', token.text, token.lemmas.map(l => l.lemma));

    const search = async () => {
      const texts = [
        ...token.lemmas.map((l) => l.lemma),
        token.text,
      ].filter((t, i, a) => a.indexOf(t) === i);
      const l2 = baseCode(l2Code);
      const cacheBase = baseCode(l2Code);

      let allEntries: DictionaryEntry[] = [];
      let cacheHit = false;

      // 1. Shared batch cache first (English defs). Show instantly even for
      //    l1 ≠ en — the L1 swap below hot-swaps the displayed cards.
      for (const text of texts) {
        const cached = getCachedEntries(cacheBase, text);
        if (cached && cached.length > 0) {
          for (const e of cached) {
            if (!e.match_type) {
              e.match_type = text === token.text ? 'exact' : 'lemma';
            }
          }
          allEntries.push(...cached);
          cacheHit = true;
          break;
        }
      }

      // 2. Cache miss — fetch from the server (already L1-translated when l1≠en).
      if (!cacheHit) {
        for (const text of texts) {
          if (cancelled) break;
          try {
            const results = await fetchEntries(text, l2Code, l1Code, controller.signal);
            if (!cancelled && results.length > 0) {
              for (const e of results) {
                if (!e.match_type) {
                  e.match_type = text === token.text ? 'exact' : 'lemma';
                }
              }
              setCachedEntries(cacheBase, text, results);
              if (l1Code !== 'en') {
                for (const e of results) setL1CachedEntry(l2, l1Code, e);
              }
              allEntries = results;
              break;
            }
          } catch {
            // Try the next term
          }
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

      // 3. Cache hit + non-English L1: show the cached English cards (already
      //    rendered above), then hot-swap in the L1-translated definitions.
      if (cacheHit && l1Code !== 'en' && !cancelled) {
        const currentIds = allEntries.map((e) => e.id).filter(Boolean);
        const cachedL1 = getL1CachedEntries(l2, l1Code, currentIds);
        if (cachedL1.length > 0) {
          const cachedL1Ids = new Set(cachedL1.map((e) => e.id));
          setEntries([
            ...cachedL1,
            ...allEntries.filter((e) => !cachedL1Ids.has(e.id)),
          ]);
        } else {
          for (const text of texts) {
            if (cancelled) break;
            try {
              const results = await fetchEntries(text, l2Code, l1Code, controller.signal);
              if (cancelled || results.length === 0) continue;
              for (const e of results) setL1CachedEntry(l2, l1Code, e);
              const byId = new Map(results.map((e) => [e.id, e]));
              setEntries(allEntries.map((e) => byId.get(e.id) ?? e));
              break;
            } catch {
              // Keep the English defs already shown.
            }
          }
        }
      }
    };

    search().catch((err) => {
      if (!cancelled && err.name !== 'AbortError') {
        logerr('Dictionary lookup error:', err);
        setError(err?.message ?? t('lookupFailed'));
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [token, l1Code, l2Code]);

  const handleExplain = useCallback(async () => {
    if (!isPro) return; // ADR-0034 D3: AI explanations are hard Pro-only
    if (showExplain) {
      setShowExplain(false);
      return;
    }
    setShowExplain(true);

    if (explainText || explainError) return;

    setExplainLoading(true);
    setExplainError(null);

    try {
      const code = l2Code;
      const lemma = token.lemmas[0]?.lemma || token.text;
      const hasContext = !!contextText;
      const hasInflectedForm = hasContext && token.text !== lemma;

      let prompt: string;
      if (hasInflectedForm) {
        prompt = t('explainWordContextForm', [l1Name, l2Name, code, lemma, token.text, contextText!]);
      } else if (hasContext) {
        prompt = t('explainWordContext', [l1Name, l2Name, code, token.text, contextText!]);
      } else {
        prompt = t('explainWord', [l1Name, l2Name, code, token.text]);
      }

      const nonInflecting = ['zh', 'vi', 'th', 'lo', 'km'];
      if (!nonInflecting.includes(code)) {
        prompt += t('explainMorphology');
      }

      const res = await apiFetch(`${API_BASE}/chatgpt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const text = data.response || data.text || data.result || JSON.stringify(data);
      setExplainText(text);
    } catch (err: any) {
      setExplainError(err?.message || t('explainFailed'));
    } finally {
      setExplainLoading(false);
    }
  }, [isPro, showExplain, explainText, explainError, token, l1Code, l2Code, l1Name, l2Name, contextText]);

  const handleFollowUp = useCallback(async (kind: FollowUpKind) => {
    if (!isPro || followUpLoading) return;
    const word = token.lemmas[0]?.lemma || token.text;
    const language = l2Name || l2Code;
    const context = contextText?.replace(/[.。！!？?…]+$/, '');
    const contextForm = token.text !== word ? token.text : undefined;
    const l2Base = baseCode(l2Code);
    let prompt = '';
    if (kind === 'examples') {
      setFollowUpLoading(kind);
      setShowExplain(true);
      setExplainError(null);
      try {
        const response = await apiFetch(`${API_BASE}/subs-search?terms=${encodeURIComponent(word)}&l2=${encodeURIComponent(l2Base)}&limit=5&context=2`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const results = await response.json();
        const lines = Array.isArray(results)
          ? results.flatMap((result: any) => String(result.subs_l2 || '').split('\n').slice(0, 2)).filter(Boolean)
          : [];
        if (lines.length === 0) throw new Error(t('noSubtitleExamples'));
        const prompt = `${t('subsAiExamples', [String(results.length), language, word])}\n\n${lines.join('\n')}`;
        const res = await apiFetch(`${API_BASE}/chatgpt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setExplainText(data.response || data.text || data.result || JSON.stringify(data));
        setUsedFollowUps((current) => current.includes(kind) ? current : [...current, kind]);
      } catch (err: any) {
        setExplainError(err?.message || t('examplesFailed'));
      } finally {
        setFollowUpLoading(null);
      }
      return;
    }
    if (kind === 'inflection') {
      prompt = context && contextForm
        ? t('followupInflectionContextForm', [language, word, contextForm, context])
        : context
          ? t('followupInflectionContext', [language, word, context])
          : t('followupInflection', [language, word]);
    } else if (kind === 'morphemes') {
      prompt = context
        ? t('followupMorphemesContext', [language, word, context])
        : t('followupMorphemes', [language, word]);
    } else if (kind === 'etymology') {
      prompt = t('followupEtymology', [language, word]);
    } else if (kind === 'syntax') {
      prompt = context
        ? t('followupSyntaxContext', [language, word, context])
        : t('followupSyntax', [language, word]);
    } else {
      prompt = context
        ? t('followupSynonymsContext', [language, word, context])
        : t('followupSynonyms', [language, word]);
      prompt += `\n\n${t('followupSynonymsExamples', [language])}`;
    }
    setFollowUpLoading(kind);
    setShowExplain(true);
    setExplainError(null);
    try {
      const res = await apiFetch(`${API_BASE}/chatgpt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setExplainText(data.response || data.text || data.result || JSON.stringify(data));
      setUsedFollowUps((current) => current.includes(kind) ? current : [...current, kind]);
    } catch (err: any) {
      setExplainError(err?.message || t('followUpFailed'));
    } finally {
      setFollowUpLoading(null);
    }
  }, [isPro, followUpLoading, token, l2Name, l2Code, contextText]);

  const l2Base = baseCode(l2Code);
  const searchUrl = `${WEB_APP}/${encodeURIComponent(l1Code)}/${encodeURIComponent(l2Code)}/dictionary?q=${encodeURIComponent(token.text)}`;

  return (
    <div className="lpv-dict-card" onClick={(e) => e.stopPropagation()}>
      {/* Card header: word + pronunciation + save + close */}
      <div className="lpv-dict-card-header">
        <div className="lpv-dict-card-header-left">
          <span className="lpv-dict-card-word">{token.text}</span>
          {token.pronunciation && (
            <span className="lpv-dict-card-pron">[{token.pronunciation}]</span>
          )}
          {token.lemmas.length > 0 && token.lemmas[0]!.lemma !== token.text && (
            <span className="lpv-dict-card-lemma">
              ← {token.lemmas.map((l) => l.lemma).join(', ')}
            </span>
          )}
        </div>
        <div className="lpv-dict-card-header-right">
          <button onClick={onClose} className="lpv-dict-card-close" title={t('close')}>
            <X size={14} />
          </button>
        </div>
      </div>

      {linkUrl && (
        <button
          type="button"
          className="lpv-page-follow-link"
          onClick={(event) => {
            event.stopPropagation();
            if (onFollowLink) onFollowLink(linkUrl);
            else window.location.assign(linkUrl);
          }}
        >
          {t('followLink')} →
        </button>
      )}

      {/* Card body */}
      <div className="lpv-dict-card-body">
        {/* AI explanation — Pro-only (ADR-0034 D3). Free users see the prompt. */}
        {!subLoading && isPro && !showExplain && (
          <Button
            onClick={handleExplain}
            variant="outline"
            size="sm"
            className="lpv-explain-btn"
            title={t('explainPro')}
          >
            <Sparkles size={14} /> {t('explain')}
          </Button>
        )}
        {!subLoading && !isPro && (
          <div className="lpv-explain-pro-banner">{t('aiProFeature')}</div>
        )}

        {/* Context sentence (collapsible) + Search images — web popup parity */}
        {contextText && (
          <div className="lpv-dict-context-row">
            <div className="lpv-dict-context-col">
              <ContextSentenceCard contextText={contextText} l1Code={l1Code} l2Code={l2Code} />
            </div>
            <a
              href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(token.text)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="lpv-dict-images-link lpv-dict-images-icon"
              title={t('searchImages')}
              aria-label={t('searchImages')}
            >
              <Image size={14} />
            </a>
          </div>
        )}

        {/* AI Explanation content */}
        {showExplain && (
          <div className="lpv-explain-section">
            {explainLoading && (
              <div className="lpv-explain-loading"><span className="lpv-spinner" /> {t('aiThinking')}</div>
            )}
            {explainError && (
              <div className="lpv-explain-error">{explainError}</div>
            )}
            {explainText && (
              <Markdown text={explainText} />
            )}
            {isPro && (
              <div className="lpv-explain-followups" aria-label={t('actions')}>
                {FOLLOW_UPS.map(({ kind, labelKey }) => (
                  <button
                    key={kind}
                    type="button"
                    className={`lpv-explain-followup ${usedFollowUps.includes(kind) ? 'is-used' : ''}`}
                    disabled={!!followUpLoading}
                    onClick={() => handleFollowUp(kind)}
                  >
                    {followUpLoading === kind ? '…' : t(labelKey)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="lpv-dict-error">
            {t('dictLoadFailed', [error])}
          </div>
        )}

        {/* Loading → stable entry-card skeletons (web parity), not a spinner */}
        {loading && (
          <>
            <EntryCardSkeleton />
            <EntryCardSkeleton />
          </>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="lpv-dict-empty">
            <span>{t('noDictionaryEntry', [token.text])}</span>
            {token.lemmas.length > 0 && (
              <span> {t('triedLemmas')}: {token.lemmas.map((l) => l.lemma).join(', ')}</span>
            )}
            <div className="lpv-dict-empty-link">
              <a href={searchUrl} target="_blank" rel="noopener noreferrer">
                {t('searchOnLanguagePlayer')}
              </a>
            </div>
          </div>
        )}

        {!loading && !error && entries.length > 0 && (
          <>
            {entries.map((entry) => (
              <EntryRow
                key={`${entry.dictionary?.id ?? 'llm'}-${entry.id}`}
                entry={entry}
                l1Code={l1Code}
                l2Code={l2Code}
                tokenForm={token.text}
                contextText={contextText}
                cueStartTime={cueStartTime}
                videoTitle={videoTitle}
                pageUrl={pageUrl}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export default DictionaryCard;
