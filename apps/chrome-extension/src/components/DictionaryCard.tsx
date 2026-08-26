/**
 * DictionaryCard — Inline dictionary lookup card for the extension.
 *
 * Renders inside the transcript panel when a word token is clicked.
 * Fetches entries from POST /dictionary/lookup and shows full details:
 * pronunciation, part of speech, definitions, proficiency levels.
 * Each entry links to the Language Player web app for full details.
 * Includes a Save/Unsave button backed by the Supabase row API (SPEC-034)
 * and a Pro-gated AI explanation (ADR-0034 D3).
 */

import React, { useEffect, useState, useCallback } from 'react';
import type { LemmatizedToken, DictionaryEntry } from '@langplayer/shared';
import { formatProficiencyLevel, primaryScale, shouldShowLevel } from '@langplayer/shared';
import { baseCode, formatPronunciation, getCachedEntries, setCachedEntries, getL1CachedEntries, setL1CachedEntry } from '@langplayer/utils';
import { useSavedWords } from './SavedWordsProvider';
import { API_BASE } from '../api-config';
import { fetchInflectedForms } from '../saved-words';
import { apiFetch } from '../api-fetch';
import { Markdown } from './Markdown';
import { Bookmark, BookmarkCheck, ExternalLink, Volume2, X } from './Icons';
import { Button } from './ui/button';
import { log, logerr, t } from '../i18n';

// ── Types ──────────────────────────────────────────────────────────────────

interface DictionaryCardProps {
  token: LemmatizedToken;
  l1Code: string;
  l2Code: string;
  /** Human-readable L1 name (e.g., "English", "日本語") */
  l1Name?: string;
  /** Human-readable L2 name (e.g., "Japanese", "français") */
  l2Name?: string;
  /** The full subtitle line text — used as save context. */
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

// ── Entry Row ──────────────────────────────────────────────────────────────

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

/** Extract a YouTube video ID from a URL if present. */
function extractYoutubeId(url: string): string | undefined {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m?.[1];
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

  const isSaved = isLoggedIn && (savedWords[l2Code] || []).some(w => w.id === entry.id);

  const handleSave = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!isLoggedIn || wordsLoading) return;

    setSaving(true);
    try {
      if (isSaved) {
        removeSavedWord(l2Code, entry.id);
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
          },
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
            },
          }],
        };
        log('[SAVE] Saving word:', JSON.stringify(record, null, 2));
        saveWord(l2Code, record);
      }
    } finally {
      setSaving(false);
    }
  }, [entry, isLoggedIn, wordsLoading, isSaved, l2Code, tokenForm, contextText, cueStartTime, videoTitle, pageUrl, saveWord, removeSavedWord]);

  const handleSpeak = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    window.speechSynthesis?.cancel();
    const utterance = new SpeechSynthesisUtterance(entry.head);
    utterance.lang = l2Base;
    utterance.rate = 0.75;
    window.speechSynthesis?.speak(utterance);
  }, [entry.head, l2Base]);

  const openEntry = useCallback(() => {
    window.open(webAppUrl, '_blank', 'noopener,noreferrer');
  }, [webAppUrl]);

  return (
    <div
      className="lpv-dict-entry-row lpv-dict-entry-card"
      role="link"
      tabIndex={0}
      onClick={openEntry}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openEntry(); } }}
    >
      <div className="lpv-dict-entry">
        <div className="lpv-dict-entry-header">
          <span className="lpv-dict-head">{entry.head}</span>
          <button className="lpv-dict-speak" type="button" onClick={handleSpeak} title={t('speak')} aria-label={t('speak')}>
            <Volume2 size={14} />
          </button>
          {formattedPronunciation && (
            <span className="lpv-dict-pron-small">{formattedPronunciation}</span>
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
        {levelBadges.length > 0 && (
          <div className="lpv-dict-levels">
            {levelBadges.map((level, i) => (
              <span key={i} className="lpv-dict-level">
                {level.short}
              </span>
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
              <ExternalLink size={12} /> {t('searchImages')}
            </a>
          </div>
          {isLoggedIn && !wordsLoading && (
            <button
              onClick={handleSave}
              disabled={saving}
              className={`lpv-entry-save-btn ${isSaved ? 'lpv-entry-save-btn-saved' : ''}`}
              title={isSaved ? t('removeFromSaved') : t('save')}
              aria-label={isSaved ? t('removeFromSaved') : t('save')}
            >
              {saving ? '…' : isSaved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
            </button>
          )}
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

      // 1. Check the shared batch cache first. The transcript lazily prefetches
      //    dictionary entries (enqueueLookupWords → /dictionary/lookup-batch,
      //    English defs) as lines are tokenized, so clicking a word can render
      //    instantly from cache instead of waiting on a fresh network request.
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

      // 2. Cache miss — fetch from the server. fetchEntries sends l1, so when
      //    l1 ≠ en the results are already L1-translated.
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
              // Cache for future use; index the L1 entry by id so other
              // surfaces reuse the exact same translation.
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

      // 3. Cache hit + non-English L1: the batch cache holds English defs for
      //    speed. Show those instantly (done above), then swap in the
      //    L1-translated definitions once they load — the same behavior as
      //    apps/web and apps/mobile.
      if (cacheHit && l1Code !== 'en' && !cancelled) {
        // Reuse L1-translated entries already fetched (e.g. by another surface)
        // — keyed by entry id so the same entry's definitions translate once.
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
        setError(err?.message ?? 'Lookup failed');
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

    // If already fetched, just toggle visibility
    if (explainText || explainError) return;

    setExplainLoading(true);
    setExplainError(null);

    try {
      const code = l2Code;
      const lemma = token.lemmas[0]?.lemma || token.text;
      const hasContext = !!contextText;
      const hasInflectedForm = hasContext && token.text !== lemma;

      // Build prompt using translated CSV keys (matches web app's AiExplanation)
      let prompt: string;
      if (hasInflectedForm) {
        prompt = t('explainWordContextForm', [l1Name, l2Name, code, lemma, token.text, contextText!]);
      } else if (hasContext) {
        prompt = t('explainWordContext', [l1Name, l2Name, code, token.text, contextText!]);
      } else {
        prompt = t('explainWord', [l1Name, l2Name, code, token.text]);
      }

      // Add morphology for inflecting languages
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
      setExplainError(err?.message || 'Explain failed');
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
    let prompt = '';
    if (kind === 'examples') {
      setFollowUpLoading(kind);
      setShowExplain(true);
      setExplainError(null);
      try {
        const response = await fetch(`${API_BASE}/subs-search?terms=${encodeURIComponent(word)}&l2=${encodeURIComponent(l2Base)}&limit=5&context=2`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const results = await response.json();
        const lines = Array.isArray(results)
          ? results.flatMap((result: any) => String(result.subs_l2 || '').split('\n').slice(0, 2)).filter(Boolean)
          : [];
        if (lines.length === 0) throw new Error('No subtitle examples found');
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
        setExplainError(err?.message || 'Examples failed');
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
      setExplainError(err?.message || 'Follow-up failed');
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

      {/* AI explanation — Pro-only (ADR-0034 D3). Free users see the prompt. */}
      {!subLoading && isPro && !showExplain && (
        <Button
          onClick={handleExplain}
          variant="outline"
          size="sm"
          className="lpv-explain-btn"
          title={t('explainPro')}
        >
          <span aria-hidden="true">✦</span> {t('explain')}
        </Button>
      )}
      {!subLoading && !isPro && (
        <div className="lpv-explain-pro-banner">{t('aiProFeature')}</div>
      )}

      {/* Card body */}
      <div className="lpv-dict-card-body">
        {/* AI Explanation */}
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

        {loading && (
          <div className="lpv-dict-loading"><span className="lpv-spinner" /> {t('lookingUpWord', [token.text])}</div>
        )}

        {error && (
          <div className="lpv-dict-error">
            Could not load dictionary entries: {error}
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="lpv-dict-empty">
            No dictionary entries found for &ldquo;{token.text}&rdquo;.
            {token.lemmas.length > 0 && (
              <span> Tried lemmas: {token.lemmas.map((l) => l.lemma).join(', ')}.</span>
            )}
            <div className="lpv-dict-empty-link">
              <a href={searchUrl} target="_blank" rel="noopener noreferrer">
                Search on Language Player →
              </a>
            </div>
          </div>
        )}

        {!loading && !error && entries.length > 0 && (
          <>
            {entries.map((entry) => (
              <EntryRow
                key={entry.id}
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
