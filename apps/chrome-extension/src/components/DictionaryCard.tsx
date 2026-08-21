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
import type { LemmatizedToken, DictionaryEntry, ProficiencyLevel } from '@langplayer/shared';
import { formatLevel } from '@langplayer/shared';
import { formatPronunciation } from '@langplayer/utils';
import { useSavedWords } from './SavedWordsProvider';
import { API_BASE } from '../api-config';
import { fetchInflectedForms } from '../saved-words';
import { apiFetch } from '../api-fetch';
import { Markdown } from './Markdown';
import { Bookmark, BookmarkCheck, X } from './Icons';
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
  /** Subscription state from the parent transcript app (ADR-0034). */
  isPro: boolean;
  subLoading: boolean;
  onClose: () => void;
}

// ── API ────────────────────────────────────────────────────────────────────

const WEB_APP = 'https://languageplayer.io';

async function fetchEntries(
  text: string,
  l2Code: string,
  l1Code: string,
  signal: AbortSignal,
): Promise<DictionaryEntry[]> {
  const res = await apiFetch(`${API_BASE}/dictionary/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, l2: l2Code.split('-')[0], l1: l1Code }),
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.results ?? []) as DictionaryEntry[];
}

function levelLabel(scale: string, value: string | number): string {
  return formatLevel({ scale, value } as ProficiencyLevel).long;
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

  return (
    <div className="lpv-dict-entry-row">
      <a
        href={webAppUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="lpv-dict-entry"
      >
        <div className="lpv-dict-entry-header">
          <span className="lpv-dict-head">{entry.head}</span>
          {formatPronunciation(entry, l2Code.split('-')[0] || l2Code) && (
            <span className="lpv-dict-pron-small">{formatPronunciation(entry, l2Code.split('-')[0] || l2Code)}</span>
          )}
          {entry.part_of_speech && (
            <span className="lpv-dict-pos">{entry.part_of_speech}</span>
          )}
          {entry.dictionary && (
            <span className="lpv-dict-source">{entry.dictionary.name}</span>
          )}
        </div>
        {entry.definitions && entry.definitions.length > 0 && (
          <div className="lpv-dict-def">{entry.definitions.join('; ')}</div>
        )}
        {entry.levels && entry.levels.length > 0 && (
          <div className="lpv-dict-levels">
            {entry.levels.map((lvl, i) => (
              <span key={i} className="lpv-dict-level">
                {levelLabel(lvl.scale, lvl.value)}
              </span>
            ))}
          </div>
        )}
      </a>
      {isLoggedIn && !wordsLoading && (
        <button
          onClick={handleSave}
          disabled={saving}
          className={`lpv-entry-save-btn ${isSaved ? 'lpv-entry-save-btn-saved' : ''}`}
          title={isSaved ? t('removeFromSaved') : t('save')}
        >
          {saving ? '…' : isSaved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
        </button>
      )}
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

  // DeepSeek responses are per-word — never carry them over to a new lookup.
  useEffect(() => {
    setExplainText(null);
    setExplainError(null);
    setExplainLoading(false);
    setShowExplain(false);
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    log('Dictionary lookup for:', token.text, token.lemmas.map(l => l.lemma));

    const search = async () => {
      const searchTerms = [
        ...token.lemmas.map((l) => l.lemma),
        token.text,
      ].filter((t, i, a) => a.indexOf(t) === i);

      let allEntries: DictionaryEntry[] = [];

      for (const term of searchTerms) {
        if (cancelled) break;
        try {
          const results = await fetchEntries(term, l2Code, l1Code, controller.signal);
          if (!cancelled && results.length > 0) {
            for (const e of results) {
              if (!e.match_type) {
                e.match_type = term === token.text ? 'exact' : 'lemma';
              }
            }
            allEntries = results;
            break;
          }
        } catch {
          // Try next term
        }
      }

      if (!cancelled) {
        const seen = new Set<string>();
        const deduped = allEntries.filter((e) => {
          if (seen.has(e.id)) return false;
          seen.add(e.id);
          return true;
        });
        log('Dictionary results:', deduped.length, 'entries');
        setEntries(deduped);
        setLoading(false);
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

      {/* AI explanation — Pro-only (ADR-0034 D3). Free users see the prompt. */}
      {!subLoading && isPro && !showExplain && (
        <button
          onClick={handleExplain}
          className="lpv-explain-btn"
          title={t('explainPro')}
        >
          {t('explain')}
        </button>
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
