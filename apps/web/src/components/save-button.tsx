'use client';

import React, { useState } from 'react';
import { Bookmark, BookmarkCheck, Loader2 } from 'lucide-react';
import type { SavedWordContext } from '@langplayer/shared';
import { useSavedWordsContext } from '@/providers/saved-words-provider';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { isWordSaved } from '@/lib/legacy-word-resolver';
import { baseCode } from '@/lib/language-data';
import { dedupeSearchTerms } from '@/lib/mutually-exclusive';
import { PYTHON_API_URL } from '@/lib/api-url';
import { Button } from '@/components/ui/button';

/** Languages that have a Python inflection endpoint. */
const INFLECT_ENDPOINTS: Record<string, string> = {
  ja: '/inflect-japanese',
  ko: '/inflect-korean',
  ru: '/inflect-pymorphy',
  uk: '/inflect-pymorphy',
  en: '/inflect-pattern',
  fr: '/inflect-pattern',
  de: '/inflect-pattern',
  es: '/inflect-pattern',
  it: '/inflect-pattern',
  nl: '/inflect-pattern',
};

async function fetchInflectedForms(head: string, l2Code: string): Promise<string[]> {
  const base = baseCode(l2Code);
  const endpoint = INFLECT_ENDPOINTS[base];
  if (!endpoint) return [head];

  try {
    const res = await fetch(
      `${PYTHON_API_URL}${endpoint}?text=${encodeURIComponent(head)}&lang=${base}`,
    );
    if (!res.ok) return [head];
    const data = await res.json();
    const forms: string[] = (Array.isArray(data) ? data : [])
      .map((f: any) => (typeof f === 'string' ? f : (f.form as string)))
      .filter((f: string) => f && f.length > 1 && f !== head);
    return dedupeSearchTerms([head, ...forms], head.length - 1);
  } catch {
    return [head];
  }
}

interface SaveButtonProps {
  /** Dictionary entry ID (e.g., "cedict-0", "llm-zh-abc123") */
  wordId: string;
  /** Canonical head form */
  head: string;
  /** Context: where/how the word is being saved */
  context: SavedWordContext;
  /** Additional alternate forms. When omitted, auto-fetches inflected forms. */
  forms?: string[];
  /** Visual size */
  size?: 'sm' | 'default' | 'icon';
}

/**
 * Bookmark toggle button for saving/removing words from the vocabulary list.
 * Mirrors Classic's Star.vue + GO's BookmarkButton.
 *
 * On save, automatically fetches all inflected/conjugated forms from the
 * Python backend so that every form of the word highlights as saved.
 */
export function SaveButton({
  wordId,
  head,
  context,
  forms,
  size = 'icon',
}: SaveButtonProps) {
  const { hasSavedWord, saveWord, removeSavedWord } = useSavedWordsContext();
  const { l2 } = useLanguage();
  const t = useT();
  const l2Code = l2.code;
  const saved = isWordSaved(hasSavedWord, l2Code, wordId);
  const [saving, setSaving] = useState(false);

  const handleToggle = async () => {
    if (saved) {
      removeSavedWord(l2Code, wordId);
      return;
    }
    setSaving(true);
    const allForms = forms ?? (await fetchInflectedForms(head, l2Code));
    saveWord(l2Code, {
      id: wordId,
      forms: allForms,
      date: Date.now(),
      context,
    });
    setSaving(false);
  };

  if (size === 'icon') {
    return (
      <button
        onClick={handleToggle}
        disabled={saving}
        className={`p-1 rounded transition-colors ${
          saved
            ? 'text-amber-500 hover:text-amber-600'
            : 'text-muted-foreground hover:text-amber-500'
        }`}
        title={saved ? t('action.remove_from_saved') : t('action.save_word')}
      >
        {saving ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : saved ? (
          <BookmarkCheck className="h-5 w-5 fill-current" />
        ) : (
          <Bookmark className="h-5 w-5" />
        )}
      </button>
    );
  }

  return (
    <Button
      variant={saved ? 'secondary' : 'outline'}
      size={size}
      onClick={handleToggle}
      disabled={saving}
      className="gap-1.5"
    >
      {saving ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : saved ? (
        <BookmarkCheck className="h-4 w-4" />
      ) : (
        <Bookmark className="h-4 w-4" />
      )}
      {saved ? t('label.saved') : t('action.save_word')}
    </Button>
  );
}
