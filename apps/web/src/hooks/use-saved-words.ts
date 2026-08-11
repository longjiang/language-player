'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import type { SavedLexicalItemRecord, SavedLexicalItemStore, SavedLexicalItemInstance } from '@langplayer/shared';
import { useSavedWordApi } from '@langplayer/api-client';
import { enqueuePendingOp, flushPendingOps, type PendingSavedWordOp } from '@langplayer/utils';
import { mergeAnonymousSavedWordsEnabled } from '@/lib/saved-words-feature';
import { log, logwarn } from '@/lib/logger';

const STORAGE_KEY = 'zthSavedWords'; // match Classic for migration compatibility
const PENDING_OPS_KEY = 'zthSavedWordsPendingOps';
const ANON_MERGED_KEY = 'lpSavedWordsAnonMerged';

/** Compact per-language counts for debug logs — never logs word content. */
function storeCounts(store: SavedLexicalItemStore | undefined | null): Record<string, number> {
  if (!store || typeof store !== 'object' || Array.isArray(store)) return {};
  const counts: Record<string, number> = {};
  for (const [l2, words] of Object.entries(store)) {
    counts[l2] = Array.isArray(words) ? words.length : -1;
  }
  return counts;
}

/**
 * Hook for managing saved words (SPEC-034 row API).
 *
 * Every save/delete is a per-word PUT/DELETE on /saved-words (Supabase via
 * Flask). Local changes are optimistic + queued in localStorage; failed ops
 * are retried on the next mutation/hydration. On login the server rows replace
 * local state (optionally after a one-time anonymous-local merge).
 */
export function useSavedWords() {
  const { data: session, status } = useSession();
  const { getSavedWords: fetchSavedWordRows, putSavedWord, deleteSavedWord } = useSavedWordApi();
  const mergeAnon = mergeAnonymousSavedWordsEnabled();
  const [savedWords, setSavedWords] = useState<SavedLexicalItemStore>({});
  const [loaded, setLoaded] = useState(false);
  const hydratedUserId = useRef<string | null>(null);
  const pendingOpsRef = useRef<PendingSavedWordOp[]>([]);
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const readLocalStore = useCallback((): SavedLexicalItemStore => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch { /* corrupted data */ }
    return {};
  }, []);

  const writeLocalStore = useCallback((words: SavedLexicalItemStore) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
    } catch { /* quota exceeded — ignore */ }
  }, []);

  const loadPendingOps = useCallback((): PendingSavedWordOp[] => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(PENDING_OPS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (op): op is PendingSavedWordOp =>
          !!op && (op.type === 'put' || op.type === 'delete')
          && typeof op.l2 === 'string' && typeof op.wordId === 'string',
      );
    } catch { /* corrupted queue — start fresh */ }
    return [];
  }, []);

  const savePendingOps = useCallback((ops: PendingSavedWordOp[]) => {
    pendingOpsRef.current = ops;
    try {
      localStorage.setItem(PENDING_OPS_KEY, JSON.stringify(ops));
    } catch { /* quota exceeded — queue stays in memory */ }
  }, []);

  // ── On mount: load from localStorage (offline-first, both anonymous & authed) ──
  useEffect(() => {
    if (loaded) return;
    if (status === 'loading') return; // still loading auth state

    const parsed = readLocalStore();
    sanitizeStore(parsed);
    log('[savedWords] local store loaded', {
      status,
      l2Keys: Object.keys(parsed),
      counts: storeCounts(parsed),
      jaCount: parsed.ja?.length ?? 0,
    });
    setSavedWords(parsed);
    savePendingOps(loadPendingOps());
    setLoaded(true);
  }, [status, loaded, readLocalStore, savePendingOps, loadPendingOps]);

  // ── Auth change (logout/login/switch): drop the previous user's in-memory
  // state and force rehydration — including logout → login as the SAME user,
  // which previously skipped hydration via hydratedUserId (SPEC-062). ──
  useEffect(() => {
    const next = session?.user?.id ?? null;
    if (prevUserIdRef.current === next) return;
    const changed = prevUserIdRef.current !== undefined;
    log('[savedWords] auth change detected', {
      next,
      prev: prevUserIdRef.current,
      changed,
      hasAccessToken: Boolean((sessionRef.current?.user as any)?.accessToken),
    });
    prevUserIdRef.current = next;
    if (changed) {
      hydratedUserId.current = null;
      setSavedWords({});
    }
  }, [session?.user?.id]);

  // ── Flush pending ops, then hydrate from the server ──
  const flushPending = useCallback(async () => {
    if (!sessionRef.current) return;
    const remaining = await flushPendingOps(pendingOpsRef.current, { putSavedWord, deleteSavedWord });
    if (remaining.length > 0) {
      logwarn('[savedWords] Pending ops remain after flush:', remaining.length);
    }
    savePendingOps(remaining);
  }, [putSavedWord, deleteSavedWord, savePendingOps]);

  useEffect(() => {
    if (status === 'loading' || !loaded) return;
    if (status !== 'authenticated') return;
    const userId = session?.user?.id ?? null;
    if (!userId) return;
    if (hydratedUserId.current === userId) return;

    log('[savedWords] hydration start', {
      status,
      loaded,
      userId,
      hasAccessToken: Boolean((sessionRef.current?.user as any)?.accessToken),
      mergeAnon,
    });

    let cancelled = false;
    (async () => {
      try {
        await flushPending();
        let res = await fetchSavedWordRows();
        if (cancelled) {
          log('[savedWords] hydration cancelled after fetch');
          return;
        }
        log('[savedWords] server response', {
          responseKeys: Object.keys(res),
          wordsType: typeof res.words,
          counts: storeCounts(res.words),
          jaCount: res.words?.ja?.length ?? 0,
        });
        let next: SavedLexicalItemStore = res.words ?? {};

        // Optional one-time merge of anonymous localStorage words into the account.
        const anonMergedKey = `${ANON_MERGED_KEY}:${userId}`;
        if (mergeAnon && typeof window !== 'undefined' && !localStorage.getItem(anonMergedKey)) {
          const local = readLocalStore();
          const toMerge = collectMissingLocalWords(next, local);
          if (toMerge.length > 0) {
            await Promise.all(toMerge.map(({ l2, word }) => putSavedWord(l2, word)));
            res = await fetchSavedWordRows();
            if (cancelled) {
              log('[savedWords] hydration cancelled after anon merge refetch');
              return;
            }
            next = res.words ?? {};
          }
          try { localStorage.setItem(anonMergedKey, '1'); } catch { /* ignore */ }
        }

        sanitizeStore(next);
        hydratedUserId.current = userId;
        log('[savedWords] hydration complete', {
          l2Keys: Object.keys(next),
          counts: storeCounts(next),
          jaCount: next.ja?.length ?? 0,
        });
        setSavedWords(next);
        writeLocalStore(next);
      } catch (err) {
        logwarn('[savedWords] Hydration failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [
    status, loaded, session?.user?.id, mergeAnon,
    flushPending, fetchSavedWordRows, putSavedWord,
    readLocalStore, writeLocalStore,
  ]);

  const persist = useCallback((words: SavedLexicalItemStore) => {
    writeLocalStore(words);
  }, [writeLocalStore]);

  const queueRowOp = useCallback((op: PendingSavedWordOp) => {
    if (!session) return;
    savePendingOps(enqueuePendingOp(pendingOpsRef.current, op));
    void flushPending();
  }, [session, savePendingOps, flushPending]);

  // ── Public API ──

  const saveWord = useCallback((l2Code: string, word: SavedLexicalItemRecord) => {
    setSavedWords(prev => {
      const langWords = [...(prev[l2Code] ?? [])];
      const existingIdx = langWords.findIndex(w => w.id === word.id);
      if (existingIdx >= 0) {
        const existing = langWords[existingIdx]!;
        const existingInsts = normalizeInstances(existing);
        const newInsts = normalizeInstances(word);
        const seen = new Set(existingInsts.map(i => `${i.timestamp}|${i.form}|${i.context.text}`));
        const mergedInsts = [...existingInsts];
        for (const ni of newInsts) {
          const key = `${ni.timestamp}|${ni.form}|${ni.context.text}`;
          if (!seen.has(key)) {
            mergedInsts.push(ni);
            seen.add(key);
          }
        }
        langWords[existingIdx] = {
          ...existing,
          instances: mergedInsts,
          forms: [...new Set([...(existing.forms ?? []), ...(word.forms ?? [])])],
          date: Math.max(existing.date ?? 0, word.date ?? 0),
          context: mergedInsts[mergedInsts.length - 1]!.context,
        };
      } else {
        if (!word.instances || word.instances.length === 0) {
          word.instances = normalizeInstances(word);
        }
        sanitizeForms(word);
        langWords.push(word);
      }
      const next = { ...prev, [l2Code]: langWords };
      persist(next);
      return next;
    });
    queueRowOp({ type: 'put', l2: l2Code, wordId: word.id, word, updatedAt: Date.now() });
  }, [persist, queueRowOp]);

  const removeSavedWord = useCallback((l2Code: string, wordId: string) => {
    setSavedWords(prev => {
      const langWords = (prev[l2Code] ?? []).filter(w => w.id !== wordId);
      const next = { ...prev, [l2Code]: langWords };
      persist(next);
      return next;
    });
    queueRowOp({ type: 'delete', l2: l2Code, wordId, updatedAt: Date.now() });
  }, [persist, queueRowOp]);

  const hasSavedWord = useCallback((l2Code: string, wordId: string): boolean => {
    return (savedWords[l2Code] ?? []).some(w => w.id === wordId);
  }, [savedWords]);

  const getSavedWords = useCallback((l2Code: string): SavedLexicalItemRecord[] => {
    return [...(savedWords[l2Code] ?? [])].sort((a, b) => b.date - a.date);
  }, [savedWords]);

  const clearSavedWords = useCallback((l2Code: string) => {
    const current = savedWords[l2Code] ?? [];
    setSavedWords(prev => {
      const next = { ...prev, [l2Code]: [] };
      persist(next);
      return next;
    });
    for (const w of current) {
      queueRowOp({ type: 'delete', l2: l2Code, wordId: w.id, updatedAt: Date.now() });
    }
  }, [persist, queueRowOp, savedWords]);

  return {
    savedWords,
    loaded,
    saveWord,
    removeSavedWord,
    hasSavedWord,
    getSavedWords,
    clearSavedWords,
  };
}

/** Local words absent from the server store (for the one-time anonymous merge). */
export function collectMissingLocalWords(
  server: SavedLexicalItemStore,
  local: SavedLexicalItemStore,
): { l2: string; word: SavedLexicalItemRecord }[] {
  const out: { l2: string; word: SavedLexicalItemRecord }[] = [];
  for (const [l2, words] of Object.entries(local)) {
    const serverIds = new Set((server[l2] ?? []).map(w => w.id));
    for (const w of words) {
      if (w.id && !serverIds.has(w.id)) {
        sanitizeForms(w);
        sanitizeContext(w);
        out.push({ l2, word: w });
      }
    }
  }
  return out;
}

// ── Instance Helpers ──────────────────────────

/** Normalize a record to its instances array, handling legacy single-context records. */
export function normalizeInstances(record: SavedLexicalItemRecord): SavedLexicalItemInstance[] {
  if (record.instances && record.instances.length > 0) {
    return record.instances;
  }
  if (record.context) {
    return [{
      timestamp: record.date,
      form: record.context.form,
      context: record.context,
    }];
  }
  return [];
}

/** Ensure every record has a forms array. Falls back to context.form or '?' for legacy records. */
function sanitizeForms(record: SavedLexicalItemRecord): void {
  if (!Array.isArray(record.forms) || record.forms.length === 0) {
    record.forms = [record.context?.form ?? '?'];
  }
}

/** Ensure a record has at least a minimal valid context. */
function sanitizeContext(record: SavedLexicalItemRecord): void {
  if (!record.context || (!record.context.form && !record.context.text)) {
    const head = record.forms?.[0] ?? '?';
    record.context = { form: head, text: head, textTitle: '' };
  }
}

/** Sanitize an entire store — ensures every record in every L2 has forms + context. */
function sanitizeStore(store: SavedLexicalItemStore): void {
  for (const [l2, words] of Object.entries(store)) {
    store[l2] = words.filter(w => {
      if (!w.id) return false;
      sanitizeForms(w);
      sanitizeContext(w);
      if (typeof w.date !== 'number') w.date = Date.now();
      return true;
    });
  }
}

/** Merge two instance arrays, deduping by timestamp+form+text. */
export function mergeInstances(
  a: SavedLexicalItemInstance[],
  b: SavedLexicalItemInstance[],
): SavedLexicalItemInstance[] {
  const seen = new Set<string>();
  const result: SavedLexicalItemInstance[] = [];
  for (const inst of [...a, ...b]) {
    const key = `${inst.timestamp}|${inst.form}|${inst.context.text}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(inst);
    }
  }
  return result.sort((x, y) => x.timestamp - y.timestamp);
}

// ── Merge Helpers ──

/** Merge cloud data into local. Merges instances per word, newer date wins per word, cloud-only words are added. */
export function mergeSavedWords(local: SavedLexicalItemStore, cloud: SavedLexicalItemStore): SavedLexicalItemStore {
  const merged: SavedLexicalItemStore = { ...local };

  for (const [l2, cloudWords] of Object.entries(cloud)) {
    const localWords = [...(merged[l2] ?? [])];
    const localById = new Map(localWords.map(w => [w.id, w]));

    for (const cw of cloudWords) {
      const lw = localById.get(cw.id);
      if (!lw) {
        sanitizeForms(cw);
        sanitizeContext(cw);
        if (typeof cw.date !== 'number') cw.date = Date.now();
        localWords.push(cw);
      } else {
        lw.instances = mergeInstances(normalizeInstances(lw), normalizeInstances(cw));
        lw.forms = [...new Set([...(lw.forms ?? []), ...(cw.forms ?? [])])];
        lw.date = Math.max(lw.date, cw.date);
        lw.context = lw.instances[lw.instances.length - 1]!.context;
      }
    }
    merged[l2] = localWords;
  }

  return merged;
}
