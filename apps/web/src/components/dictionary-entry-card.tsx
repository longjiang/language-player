'use client';

import { useMemo } from 'react';
import type { DictionaryEntry, SavedWordContext } from '@langplayer/shared';
import { formatNumericLevel, primaryScale } from '@langplayer/shared';
import { BookmarkCheck, BookOpen, ExternalLink, Video } from 'lucide-react';
import { SaveButton } from './save-button';
import { SpeakButton } from './speak-button';
import { formatPronunciation } from '@langplayer/utils';
import { useT } from '@/hooks/use-t';
import { useScriptPreference } from '@/hooks/use-script-preference';
import { useLanguage } from '@/providers/language-provider';
import { useSavedWordsContext } from '@/providers/saved-words-provider';
import { normalizeInstances } from '@/hooks/use-saved-words';

interface DictionaryEntryCardProps {
  entry: DictionaryEntry;
  /** 'compact' = popup/list view; 'full' = detail page view */
  variant?: 'compact' | 'full';
  /** Called when the card is clicked (navigates to entry detail page) */
  onClick?: (entry: DictionaryEntry) => void;
  /** Optional indicator rendered beside the level badges in compact mode (e.g. SRS review dot). */
  srsDot?: React.ReactNode;
  /** Context for the save/bookmark button. Omit to hide (compact) or show (full). */
  saveContext?: SavedWordContext;
  /** Pre-formatted pronunciation string. Uses centralized formatPronunciation if omitted. */
  pronunciation?: string | null;
  /** ISO 639-1 code of the target language (for script preference + font rendering). */
  l2Code?: string;
  /** ISO 639-1 code of the user's L1 (for SpeakButton language context). */
  l1Code?: string;
  /** WAI-ARIA heading level for the headword (full mode defaults to h1). */
  headingLevel?: 'h1' | 'h2' | 'h3';
}

/** Renders the entry details for a dictionary lookup result — compact in popups, full on detail pages.
 *  No tabs. Use DictionaryEntryTabs to wrap this card with tabbed sections (Examples, DeepSeek, etc.). */
export function DictionaryEntryCard({
  entry,
  variant = 'compact',
  onClick,
  srsDot,
  saveContext,
  pronunciation,
  l2Code,
  l1Code,
  headingLevel = 'h1',
}: DictionaryEntryCardProps) {
  const t = useT();
  const { l1 } = useLanguage();
  const { getSavedWords } = useSavedWordsContext();
  const { apply, getAlternateScript } = useScriptPreference(l2Code ?? '');
  const { head, alternate } = apply(entry.head, entry.alternate);
  const isFull = variant === 'full';

  const scale = primaryScale(l2Code ?? '');
  const levels = entry.levels ?? [];
  const levelBadges = levels
    .filter((l) => l.numeric != null)
    .map((l) => formatNumericLevel(l.numeric, scale));

  const formattedPron = pronunciation !== undefined
    ? pronunciation
    : formatPronunciation(entry, l2Code ?? '');

  const displayAlternate = getAlternateScript({ ...entry, head, alternate });

  const studyMaterials = entry.studyMaterials;

  // ── Saved metadata — shown when this entry is in the user's saved words ──
  // Date + context sentence + context source (video/book) + title.
  const savedRecord = useMemo(
    () => (l2Code ? getSavedWords(l2Code).find((w) => w.id === entry.id) : undefined),
    [getSavedWords, l2Code, entry.id],
  );
  const savedInsts = savedRecord ? normalizeInstances(savedRecord) : [];
  const savedCtx = savedRecord
    ? savedInsts[savedInsts.length - 1]?.context ?? savedRecord.context
    : undefined;
  const saveDateStr = savedRecord?.date
    ? new Date(savedRecord.date).toLocaleDateString(l1Code ?? l1.code)
    : '';
  const contextSentence = savedCtx?.text && savedCtx.text !== entry.head ? savedCtx.text : undefined;
  const hasVideoSource = !!(savedCtx?.youtube_id && savedCtx?.videoTitle);
  const hasTextSource = !!savedCtx?.textTitle;
  const sourceLabel = hasVideoSource
    ? savedCtx?.videoTitle
    : hasTextSource ? savedCtx?.textTitle : undefined;

  // ── Shared: level badges ──
  const badges = (
    <>
      {levelBadges.map((level, i) => (
      <span
          key={i}
          className={isFull
            ? "rounded-md px-2.5 py-1 text-sm font-medium"
            : "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
          }
          style={{ backgroundColor: `${level.hexColor}1A`, color: level.hexColor }}
        >
          {level.short}
        </span>
      ))}
    </>
  );

  // ── Shared: source line ──
  const sourceName = entry.dictionary?.name ?? entry.source;
  const displaySource = sourceName === 'AI-Generated' || sourceName === 'LLM' ? t('label.ai_generated') : sourceName;
  const googleImagesUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(entry.head)}`;
  const sourceLine = (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <BookOpen className="h-3 w-3" />
      <span>{displaySource}</span>
      {isFull && onClick && (
        <button
          type="button"
          onClick={() => onClick(entry)}
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
          title={t('action.open_in_dictionary')}
        >
          <ExternalLink className="h-3 w-3" />
          <span>{t('action.open_in_dictionary')}</span>
        </button>
      )}
      <a
        href={googleImagesUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        title={t('action.search_images')}
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLink className="h-3 w-3" />
        <span>{t('action.search_images')}</span>
      </a>
      {entry.match_type && entry.match_type !== 'exact' && (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          {entry.match_type}
        </span>
      )}
    </div>
  );

  // ── Shared: save button ──
  const saveBtn = (size: 'icon' | 'default' = 'icon') => saveContext ? (
    <div onClick={(e) => e.stopPropagation()}>
      <SaveButton
        wordId={entry.id}
        head={entry.head}
        context={saveContext}
        size={size}
      />
    </div>
  ) : null;

  // ── COMPACT variant ──
  if (!isFull) {
    return (
      <div
        className="rounded-lg border bg-card p-3 text-sm shadow-sm transition-colors hover:bg-muted/30 cursor-pointer"
        onClick={() => onClick?.(entry)}
      >
        {/* Header */}
        <div className="flex items-start gap-2">
          <div className="flex-1 flex items-center gap-2 flex-wrap">
            <span className="text-lg font-bold text-foreground" lang={l2Code}>{head}</span>
            {displayAlternate && (
              <span className="text-xs text-muted-foreground" lang={l2Code}>{displayAlternate}</span>
            )}
            <SpeakButton text={head} l2Code={l2Code ?? ''} size="sm" />
            {formattedPron && (
              <span className="text-sm text-muted-foreground">{formattedPron}</span>
            )}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {badges}
            {srsDot}
          </div>
        </div>

        {/* Definitions */}
        {(entry.part_of_speech || entry.definitions.length > 0) && (
          <p className="mt-2 text-sm leading-snug text-muted-foreground">
            {entry.part_of_speech && (
              <span className="italic">{entry.part_of_speech}{'  '}</span>
            )}
            {entry.definitions.map((def, i) => (
              <span key={i}>
                <span className="font-bold">{i + 1}</span>
                {' '}{def}{i < entry.definitions.length - 1 ? '  ' : ''}
              </span>
            ))}
          </p>
        )}

        {/* Classifiers */}
        {entry.classifier && entry.classifier.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <span className="text-[10px] font-medium text-muted-foreground mr-0.5">
              {entry.classifier[0]!.kind === 'measure_word' ? t('label.measure_word') :
               entry.classifier[0]!.kind === 'gender' ? t('label.gender_label') : t('label.noun_class')}
            </span>
            {entry.classifier.map((cl, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs"
                title={cl.kind === 'measure_word'
                  ? `Measure word: ${cl.traditional} (${cl.reading})`
                  : cl.kind === 'gender'
                    ? `Gender: ${cl.value}`
                    : `Noun class: ${cl.value}`}
              >
                {cl.kind === 'measure_word' ? (
                  <>
                    <span className="font-medium" lang="zh">{cl.simplified}</span>
                    <span className="text-muted-foreground">{cl.reading}</span>
                  </>
                ) : cl.kind === 'gender' ? (
                  <span className="text-muted-foreground">{cl.value}</span>
                ) : (
                  <span className="text-muted-foreground">{cl.value}</span>
                )}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-2 flex items-center gap-2 text-[10px]">
          {sourceLine}
          {saveContext && <div className="ml-auto">{saveBtn()}</div>}
        </div>

        {/* Saved metadata — date, context sentence, source type + title */}
        {savedRecord && (
          <div className="mt-2 space-y-1 rounded-md bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground">
            <div className="flex items-start gap-1.5">
              <BookmarkCheck className="mt-0.5 h-3 w-3 shrink-0" />
              <p className="min-w-0 flex-1 line-clamp-2" lang={l2Code}>
                <span>{saveDateStr}</span>
                {contextSentence && <> · “{contextSentence}”</>}
              </p>
            </div>
            {sourceLabel && (
              <div className="flex items-center gap-1.5">
                {hasVideoSource
                  ? <Video className="h-3 w-3 shrink-0" />
                  : <BookOpen className="h-3 w-3 shrink-0" />}
                <span className="truncate">{sourceLabel}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── FULL variant ──
  const HeadTag = headingLevel;

  // Phonetic detail extras — skip keys already shown as the main pronunciation.
  // Only render the row when at least one extra survives (avoids an empty spacer).
  const phoneticExtras: Array<[string, string]> = entry.phonetic_detail && typeof entry.phonetic_detail === 'object'
    ? Object.entries(entry.phonetic_detail).flatMap(([key, value]) => {
        // Skip keys shown prominently in the header
        if (key === 'romaji' || key === 'pinyin' || key === 'jyutping') return [];
        // Skip raw representations of the already-displayed pronunciation
        if (key === 'pinyin_numeric' || key === 'kana') return [];
        // Skip IPA if it matches the pronunciation already shown
        if (key === 'ipa' && value === entry.pronunciation) return [];
        if (typeof value !== 'string' || !value) return [];
        return [[key, value]];
      })
    : [];

  return (
    <div>
      {/* Header: head + badges, then pronunciation row (matches mobile full) */}
      <div className="mb-3">
        <div className="flex items-start gap-3">
          <HeadTag className="shrink-0 text-3xl font-bold" lang={l2Code}>
            {head}
          </HeadTag>
          {displayAlternate && (
            <span className="mt-2 shrink-0 text-base text-muted-foreground" lang={l2Code}>
              {displayAlternate}
            </span>
          )}
          <div className="flex-1" />
          {badges}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <SpeakButton text={entry.head} l2Code={l2Code ?? ''} size="default" />
          {formattedPron && (
            <span className="text-base text-muted-foreground" lang={l2Code}>
              {formattedPron}
            </span>
          )}
        </div>
      </div>

      {/* Definitions */}
      {entry.definitions.length > 0 && (
        <div className="mb-6 rounded-lg bg-muted/40 p-4">
          {entry.part_of_speech && (
            <p className="mb-2 text-xs italic text-muted-foreground">{entry.part_of_speech}</p>
          )}
          <ul className="space-y-1.5">
            {entry.definitions.map((def, i) => (
              <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
                {entry.definitions.length > 1 && (
                  <span className="flex-shrink-0 text-sm text-muted-foreground">
                    {i + 1}.
                  </span>
                )}
                <span>{def}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Classifiers */}
      {entry.classifier && entry.classifier.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {entry.classifier[0]!.kind === 'gender' ? t('title.gender') :
             entry.classifier[0]!.kind === 'measure_word' ? t('title.measure_words') :
             t('title.classifiers')}
          </h3>
          <div className="flex flex-wrap gap-2">
            {entry.classifier.map((cl, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1 text-sm"
              >
                {cl.kind === 'measure_word' ? (
                  <>
                    <span className="font-medium" lang="zh">{cl.simplified}</span>
                    <span className="text-muted-foreground">{cl.reading}</span>
                  </>
                ) : cl.kind === 'gender' ? (
                  <span className="text-muted-foreground">{cl.value}</span>
                ) : (
                  <span className="text-muted-foreground">{cl.value}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Study material coverage */}
      {studyMaterials && studyMaterials.length > 0 && (
        <div className="mb-6 rounded-lg bg-blue-50/50 p-3 dark:bg-blue-950/20">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('title.textbook_appearances')}
          </h3>
          {studyMaterials.map((m, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                <BookOpen className="h-3.5 w-3.5" />
                <span>{t('label.textbook_format', { material: m.material, book: m.location?.book, lesson: m.location?.lesson })}{m.location?.dialog ? `, ${t('label.dialog')} ${m.location.dialog}` : ''}</span>
              </div>
              {m.example && (
                <p className="text-sm" lang={l2Code}>{m.example}</p>
              )}
              {m.exampleTranslation && (
                <p className="text-sm text-muted-foreground">{m.exampleTranslation}</p>
              )}
              {i < studyMaterials.length - 1 && <hr className="my-2" />}
            </div>
          ))}
        </div>
      )}

      {/* Han script detail — only show whats not already in the header */}
      {entry.han_script && (entry.han_script.traditional || entry.han_script.simplified) && (
        <div className="mb-6 flex gap-4 text-sm text-muted-foreground">
          {entry.han_script.simplified && entry.han_script.simplified !== head && entry.han_script.simplified !== alternate && (
            <span>简: {entry.han_script.simplified}</span>
          )}
          {entry.han_script.traditional && entry.han_script.traditional !== head && entry.han_script.traditional !== alternate && (
            <span>繁: {entry.han_script.traditional}</span>
          )}
        </div>
      )}

      {/* Phonetic detail — skip keys already shown as the main pronunciation */}
      {phoneticExtras.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground/70">
          {phoneticExtras.map(([key, value]) => (
            <span key={key}>{key}: {value}</span>
          ))}
        </div>
      )}

      {/* Footer source + save */}
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          {sourceLine}
        </div>
        {saveContext && saveBtn('default')}
      </div>

      {/* Saved metadata — date, context sentence, source type + title */}
      {savedRecord && (
        <div className="mt-4 space-y-1.5 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <BookmarkCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="min-w-0 flex-1 line-clamp-2" lang={l2Code}>
              <span>{saveDateStr}</span>
              {contextSentence && <> · “{contextSentence}”</>}
            </p>
          </div>
          {sourceLabel && (
            <div className="flex items-center gap-2">
              {hasVideoSource
                ? <Video className="h-4 w-4 shrink-0" />
                : <BookOpen className="h-4 w-4 shrink-0" />}
              <span className="truncate">{sourceLabel}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
