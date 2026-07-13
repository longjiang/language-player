'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { useSavedWordsContext } from '@/providers/saved-words-provider';
import { useT } from '@/hooks/use-t';
import { languageName } from '@/lib/language-data';
import { BookOpen, Video, ExternalLink, Trash2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SavedWord } from '@langplayer/shared';

const STORAGE_KEY = 'zthSavedWords';

/**
 * Saved Words page — vocabulary list for the current L2, grouped by date.
 * Route: /[l1]/[l2]/saved-words
 */
export default function SavedWordsPage() {
  const { l1, l2 } = useLanguage();
  const { getSavedWords, clearSavedWords, loaded } = useSavedWordsContext();
  const router = useRouter();
  const t = useT();

  const words = useMemo(() => getSavedWords(l2.code), [getSavedWords, l2.code]);

  // Group by date: today vs earlier
  const { today, earlier } = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayWords: SavedWord[] = [];
    const earlierWords: SavedWord[] = [];

    for (const w of words) {
      if (w.date >= startOfToday) {
        todayWords.push(w);
      } else {
        earlierWords.push(w);
      }
    }
    return { today: todayWords, earlier: earlierWords };
  }, [words]);

  const handleExport = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) ?? '{}';
      const blob = new Blob([raw], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `saved-words-${l2.code}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  };

  const handleClearAll = () => {
    if (window.confirm(t('msg.confirm_clear_words'))) {
      clearSavedWords(l2.code);
    }
  };

  if (!loaded) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('title.saved_words')}</h1>
          <p className="mt-1 text-muted-foreground">
            {t('msg.saved_words_desc', {
              count: words.length,
              l2: languageName(l2.code),
            })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={words.length === 0}>
            <Download className="mr-1 h-4 w-4" />
            Export
          </Button>
          <Button variant="outline" size="sm" onClick={handleClearAll} disabled={words.length === 0}>
            <Trash2 className="mr-1 h-4 w-4" />
            Clear All
          </Button>
        </div>
      </div>

      {words.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-lg text-muted-foreground">
            {t('msg.no_saved_words')}
          </p>
          <p className="mt-1 text-sm text-muted-foreground/70">
            Click the bookmark icon next to any word to save it.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {today.length > 0 && (
            <WordGroup
              label={t('msg.today')}
              words={today}
              l1Code={l1.code}
              l2Code={l2.code}
              onWordClick={(w) => router.push(`/${l1.code}/${l2.code}/dictionary?q=${encodeURIComponent(w.forms[0] ?? '')}`)}
            />
          )}

          {earlier.length > 0 && (
            <WordGroup
              label={t('msg.earlier')}
              words={earlier}
              l1Code={l1.code}
              l2Code={l2.code}
              onWordClick={(w) => router.push(`/${l1.code}/${l2.code}/dictionary?q=${encodeURIComponent(w.forms[0] ?? '')}`)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Renders a group of saved words under a date heading. */
function WordGroup({
  label,
  words,
  l1Code,
  l2Code,
  onWordClick,
}: {
  label: string;
  words: SavedWord[];
  l1Code: string;
  l2Code: string;
  onWordClick: (word: SavedWord) => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-semibold text-muted-foreground">{label}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {words.length}
        </span>
      </div>
      <div className="space-y-1">
        {words.map((word) => (
          <SavedWordRow
            key={`${word.id}-${word.date}`}
            word={word}
            l1Code={l1Code}
            l2Code={l2Code}
            onClick={() => onWordClick(word)}
          />
        ))}
      </div>
    </div>
  );
}

/** Single saved word row with context info. */
function SavedWordRow({
  word,
  l1Code,
  l2Code,
  onClick,
}: {
  word: SavedWord;
  l1Code: string;
  l2Code: string;
  onClick: () => void;
}) {
  const ctx = word.context;
  const hasVideoContext = ctx.youtube_id && ctx.videoTitle;
  const dateStr = new Date(word.date).toLocaleDateString();

  return (
    <div
      className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted/50"
      onClick={onClick}
    >
      {/* Word form */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">{word.forms[0] ?? '?'}</span>
          {ctx.form !== word.forms[0] && (
            <span className="text-xs text-muted-foreground">
              ({ctx.form})
            </span>
          )}
          {word.forms.length > 1 && (
            <span className="text-xs text-muted-foreground">
              {word.forms.slice(1).join(', ')}
            </span>
          )}
        </div>

        {/* Context: subtitle line */}
        {ctx.text && ctx.text !== word.forms[0] && (
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            …{ctx.text}…
          </p>
        )}

        {/* Source attribution */}
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground/70">
          {hasVideoContext ? (
            <>
              <Video className="h-3 w-3" />
              <span className="truncate">{ctx.videoTitle}</span>
            </>
          ) : ctx.textTitle ? (
            <>
              <BookOpen className="h-3 w-3" />
              <span className="truncate">{ctx.textTitle}</span>
            </>
          ) : null}
          <span>· {dateStr}</span>
        </div>
      </div>

      <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground/50" />
    </div>
  );
}
