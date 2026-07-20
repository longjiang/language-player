/**
 * DictionaryCard — Inline dictionary lookup card for the extension.
 *
 * Renders inside the transcript panel when a word token is clicked.
 * Fetches entries from POST /dictionary/lookup and shows previews
 * with a link to the full Language Player web app.
 */

import React, { useEffect, useState, useRef } from 'react';
import type { LemmatizedToken, DictionaryEntry, ProficiencyLevel } from '@langplayer/shared';
import { formatLevel } from '@langplayer/shared';

// ── Types ──────────────────────────────────────────────────────────────────

interface DictionaryCardProps {
  token: LemmatizedToken;
  l1Code: string;
  l2Code: string;
  /** The full subtitle line text (for context) */
  contextText?: string;
  onClose: () => void;
}

// ── API ────────────────────────────────────────────────────────────────────

const API_BASE = 'https://pythonvps.zerotohero.ca';

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
  const webAppUrl = `https://zerotohero.ca/${l1Code}/${l2Code}/dictionary/entry/${entry.dictionary?.id ?? 'llm'}/${entry.id}`;

  const firstDef = entry.definition ?? '';
  const shortDef = firstDef.length > 120 ? firstDef.slice(0, 120) + '…' : firstDef;

  return (
    <a
      href={webAppUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="lpv-dict-entry"
    >
      <div className="lpv-dict-entry-header">
        <span className="lpv-dict-head">{entry.head}</span>
        {entry.part_of_speech && (
          <span className="lpv-dict-pos">{entry.part_of_speech}</span>
        )}
        {entry.dictionary && (
          <span className="lpv-dict-source">{entry.dictionary.name}</span>
        )}
      </div>
      {shortDef && <div className="lpv-dict-def">{shortDef}</div>}
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
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const search = async () => {
      // Try lemmas first, then the surface form
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
            // Set match type
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
        // Deduplicate
        const seen = new Set<string>();
        const deduped = allEntries.filter((e) => {
          if (seen.has(e.id)) return false;
          seen.add(e.id);
          return true;
        });
        setEntries(deduped);
        setLoading(false);
      }
    };

    search().catch((err) => {
      if (!cancelled && err.name !== 'AbortError') {
        setError(err?.message ?? 'Lookup failed');
        setLoading(false);
      }
    });

    // Close on click outside
    const handleClickOutside = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid the click that opened the card from closing it
    setTimeout(() => document.addEventListener('click', handleClickOutside), 0);

    return () => {
      cancelled = true;
      controller.abort();
      document.removeEventListener('click', handleClickOutside);
    };
  }, [token, l1Code, l2Code, onClose]);

  const webAppUrl = `https://zerotohero.ca/${l1Code}/${l2Code}/dictionary/entry/llm/${encodeURIComponent(token.text)}`;

  return (
    <div ref={cardRef} className="lpv-dict-card" onClick={(e) => e.stopPropagation()}>
      {/* Card header: word + pronunciation + close */}
      <div className="lpv-dict-card-header">
        <div>
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
        <button onClick={onClose} className="lpv-dict-card-close" title="Close">
          ✕
        </button>
      </div>

      {/* Card body */}
      <div className="lpv-dict-card-body">
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
