import type { SavedWord, DictionaryEntry } from '@langplayer/shared';
import { buildEntryRoute } from '@/lib/entry-route';

/**
 * Lightweight word list item stored in sessionStorage for cross-page navigation.
 * Normalized from both SavedWord (saved-words page) and DictionaryEntry (popup/search).
 */
export interface WordListNavItem {
  /** Display form in L2 script. */
  head: string;
  /** Dictionary ID (e.g., "cedict", "edict", "llm"). */
  dictionaryId: string;
  /** Scoped entry ID within the dictionary. */
  entryId: string;
  /** Full composite ID for dedup (e.g., "cedict-0"). */
  id: string;
  /** Optional pronunciation. */
  pronunciation?: string;
  /** Optional first definition. */
  definition?: string;
}

const STORAGE_KEY = 'lp_word_list_nav';

interface StoredList {
  items: WordListNavItem[];
  currentEntryId: string;
}

function write(items: WordListNavItem[], currentEntryId: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ items, currentEntryId }));
  } catch { /* quota exceeded */ }
}

function read(): StoredList | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Store a word list before navigating to an entry detail page.
 * Overwrites any previous list. The entry page reads it to render the sidebar.
 */
export function setWordListNav(items: WordListNavItem[], currentEntryId: string): void {
  write(items, currentEntryId);
}

/**
 * Update only the currently-selected entry in the stored list.
 * Called when clicking a word in the sidebar itself (not from a source list).
 */
export function updateCurrentEntryId(entryId: string): void {
  const stored = read();
  if (stored) {
    write(stored.items, entryId);
  }
}

/**
 * Read the stored word list. Does NOT clear — persists across navigations
 * and page refreshes. Source pages overwrite it via setWordListNav().
 */
export function getWordListNav(): StoredList | null {
  return read();
}

/**
 * Build the entry page route with the list-current query param appended,
 * so the page knows which item is highlighted even after refresh.
 */
export function buildEntryRouteWithList(
  l1Code: string,
  l2Code: string,
  dictionaryId: string,
  entryId: string,
  compositeId: string,
): string {
  const base = buildEntryRoute(l1Code, l2Code, dictionaryId, entryId);
  return `${base}?listCurrent=${encodeURIComponent(compositeId)}`;
}

/**
 * Convert a SavedWord to a WordListNavItem.
 */
export function savedWordToNavItem(w: SavedWord): WordListNavItem {
  const dashIdx = w.id.indexOf('-');
  const dictionaryId = dashIdx > 0 ? w.id.slice(0, dashIdx) : 'unknown';
  const entryId = dashIdx > 0 ? w.id.slice(dashIdx + 1) : w.id;
  return {
    head: w.forms[0] ?? '',
    dictionaryId,
    entryId,
    id: w.id,
  };
}

/**
 * Convert a DictionaryEntry to a WordListNavItem.
 */
export function entryToNavItem(e: DictionaryEntry): WordListNavItem {
  return {
    head: e.head,
    dictionaryId: e.dictionary?.id ?? 'llm',
    entryId: e.id,
    id: `${e.dictionary?.id ?? 'llm'}-${e.id}`,
    pronunciation: e.pronunciation || undefined,
    definition: e.definitions?.[0] || undefined,
  };
}

