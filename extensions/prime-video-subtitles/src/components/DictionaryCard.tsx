/**
 * DictionaryCard — Inline dictionary lookup card for the extension.
 *
 * Renders inside the transcript panel when a word token is clicked.
 * Fetches entries from POST /dictionary/lookup and shows full details:
 * pronunciation, part of speech, definitions, proficiency levels.
 * Each entry links to the Language Player web app for full details.
 * Includes a Save/Unsave button backed by Directus sync.
 */

import React, { useEffect, useState, useCallback } from 'react';
import type { LemmatizedToken, DictionaryEntry, ProficiencyLevel } from '@langplayer/shared';
import { formatLevel } from '@langplayer/shared';
import { useSavedWords } from './SavedWordsProvider';
import { fetchInflectedForms } from '../saved-words';
import { useSubscription } from '../use-subscription';

// ── Types ──────────────────────────────────────────────────────────────────

interface DictionaryCardProps {
  token: LemmatizedToken;
  l1Code: string;
  l2Code: string;
  contextText?: string;
  onClose: () => void;
}

// ── API ────────────────────────────────────────────────────────────────────

const API_BASE = 'https://pythonvps.zerotohero.ca';
const WEB_APP = 'https://language-player.netlify.app';

async function fetchEntries(
  text: string,
  l2Code: string,
  l1Code: string,
  signal: AbortSignal,
): Promise<DictionaryEntry[]> {
  const res = await fetch(`${API_BASE}/dictionary/lookup`, {
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
}

const EntryRow: React.FC<EntryRowProps> = React.memo(({ entry, l1Code, l2Code }) => {
  const dictId = entry.dictionary?.id ?? 'llm';
  const webAppUrl = `${WEB_APP}/dictionary/${dictId}/${entry.id}`;

  return (
    <a
      href={webAppUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="lpv-dict-entry"
    >
      <div className="lpv-dict-entry-header">
        <span className="lpv-dict-head">{entry.head}</span>
        {entry.pronunciation && (
          <span className="lpv-dict-pron-small">[{entry.pronunciation}]</span>
        )}
        {entry.part_of_speech && (
          <span className="lpv-dict-pos">{entry.part_of_speech}</span>
        )}
        {entry.dictionary && (
          <span className="lpv-dict-source">{entry.dictionary.name}</span>
        )}
      </div>
      {entry.definition && (
        <div className="lpv-dict-def">{entry.definition}</div>
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
  );
});
EntryRow.displayName = 'EntryRow';

// ── Main Card ──────────────────────────────────────────────────────────────

export const DictionaryCard: React.FC<DictionaryCardProps> = ({
  token,
  l1Code,
  l2Code,
  contextText,
  onClose,
}) => {
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { savedWords, saveWord, removeSavedWord, isLoggedIn } = useSavedWords();
  const { isPro, loading: subLoading } = useSubscription();

  // ── Explain state ──
  const [explainText, setExplainText] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [showExplain, setShowExplain] = useState(false);

  // Check if any form of this token is already saved
  const firstEntry = entries[0];
  const isSaved = !!firstEntry && (savedWords[l2Code] || []).some(
    w => w.id === firstEntry.id
  );

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    console.log('[LPV] Dictionary lookup for:', token.text, token.lemmas.map(l => l.lemma));

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
        console.log('[LPV] Dictionary results:', deduped.length, 'entries');
        setEntries(deduped);
        setLoading(false);
      }
    };

    search().catch((err) => {
      if (!cancelled && err.name !== 'AbortError') {
        console.error('[LPV] Dictionary lookup error:', err);
        setError(err?.message ?? 'Lookup failed');
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [token, l1Code, l2Code]);

  const handleSave = useCallback(async () => {
    if (!firstEntry || !isLoggedIn) return;
    setSaving(true);
    try {
      if (isSaved) {
        removeSavedWord(l2Code, firstEntry.id);
      } else {
        const allForms = await fetchInflectedForms(firstEntry.head, l2Code);
        saveWord(l2Code, {
          id: firstEntry.id,
          forms: allForms,
          date: Date.now(),
          context: {
            form: token.text,
            text: contextText || token.text,
          },
          instances: [{
            timestamp: Date.now(),
            form: token.text,
            context: {
              form: token.text,
              text: contextText || token.text,
            },
          }],
        });
      }
    } finally {
      setSaving(false);
    }
  }, [firstEntry, isLoggedIn, isSaved, l2Code, token, contextText, saveWord, removeSavedWord]);

  const handleExplain = useCallback(async () => {
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
      const prompt = `Explain the word "${token.text}" in ${l2Code}. Include:
1. Meaning and usage
2. Example sentences
3. Any cultural notes or nuances
Keep it concise (2-3 paragraphs). Respond in plain text.`;

      const res = await fetch(`${API_BASE}/chatgpt`, {
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
  }, [showExplain, explainText, explainError, token.text, l2Code]);

  const webAppUrl = `${WEB_APP}/dictionary/llm/${encodeURIComponent(token.text)}`;

  return (
    <div className="lpv-dict-card" onClick={(e) => e.stopPropagation()}>
      {/* Card header: word + pronunciation + save button + close */}
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
          {isPro && (
            <button
              onClick={handleExplain}
              disabled={explainLoading}
              className={`lpv-explain-btn ${showExplain ? 'lpv-explain-btn-active' : ''}`}
              title="AI Explanation (Pro)"
            >
              {explainLoading ? '…' : '🤖 Explain'}
            </button>
          )}
          {isLoggedIn && firstEntry && (
            <button
              onClick={handleSave}
              disabled={saving}
              className={`lpv-save-btn ${isSaved ? 'lpv-save-btn-saved' : ''}`}
              title={isSaved ? 'Unsave' : 'Save word'}
            >
              {saving ? '…' : isSaved ? '★ Saved' : '☆ Save'}
            </button>
          )}
          <button onClick={onClose} className="lpv-dict-card-close" title="Close">
            ✕
          </button>
        </div>
      </div>

      {/* Card body */}
      <div className="lpv-dict-card-body">
        {/* AI Explanation */}
        {showExplain && (
          <div className="lpv-explain-section">
            {explainLoading && (
              <div className="lpv-explain-loading">🤖 AI is thinking…</div>
            )}
            {explainError && (
              <div className="lpv-explain-error">{explainError}</div>
            )}
            {explainText && (
              <div className="lpv-explain-text">{explainText}</div>
            )}
          </div>
        )}

        {loading && (
          <div className="lpv-dict-loading">Looking up &ldquo;{token.text}&rdquo;…</div>
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
              <a href={webAppUrl} target="_blank" rel="noopener noreferrer">
                Search on Language Player →
              </a>
            </div>
          </div>
        )}

        {!loading && !error && entries.length > 0 && (
          <>
            {entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} l1Code={l1Code} l2Code={l2Code} />
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export default DictionaryCard;
