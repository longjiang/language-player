'use client';

import type { DictionaryEntry, SavedWordContext } from '@langplayer/shared';
import { formatNumericLevel, primaryScale } from '@langplayer/shared';
import { BookOpen, ExternalLink } from 'lucide-react';
import { SaveButton } from './save-button';
import { SpeakButton } from './speak-button';
import { formatPronunciation } from '@langplayer/utils';
import { useT } from '@/hooks/use-t';
import { useScriptPreference } from '@/hooks/use-script-preference';

interface DictionaryEntryCardProps {
  entry: DictionaryEntry;
  /** 'compact' = popup/list view; 'full' = detail page view */
  variant?: 'compact' | 'full';
  /** Language-specific level label formatter */
  levelLabel?: (scale: string, value: string | number) => string;
  /** Called when the card is clicked (navigates to entry detail page) */
  onClick?: (entry: DictionaryEntry) => void;
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
  levelLabel,
  onClick,
  saveContext,
  pronunciation,
  l2Code,
  l1Code,
  headingLevel = 'h1',
}: DictionaryEntryCardProps) {
  const t = useT();
  const { apply, getAlternateScript } = useScriptPreference(l2Code ?? '');
  const { head, alternate } = apply(entry.head, entry.alternate);
  const isFull = variant === 'full';

  const scale = primaryScale(l2Code ?? '');
  const levels = entry.levels ?? [];
  const levelBadges = levels
    .filter((l) => l.numeric != null)
    .map((l) => {
      const formatted = formatNumericLevel(l.numeric, scale);
      return {
        label: levelLabel ? levelLabel(l.scale, l.value) : formatted.short,
        hexColor: formatted.hexColor,
      };
    });

  const formattedPron = pronunciation !== undefined
    ? pronunciation
    : formatPronunciation(entry, l2Code ?? '');

  const displayAlternate = getAlternateScript({ ...entry, head, alternate });

  const studyMaterials = entry.studyMaterials;

  // ── Shared: level badges ──
  const badges = (
    <>
      {levelBadges.map((level, i) => (
        <span
          key={i}
          className={isFull
            ? "rounded-md bg-blue-100 px-2.5 py-1 text-sm font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200"
            : "ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
          }
          style={isFull ? undefined : { backgroundColor: level.hexColor + '1A', color: level.hexColor }}
        >
          {level.label}
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
          {badges}
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
      </div>
    );
  }

  // ── FULL variant ──
  const HeadTag = headingLevel;

  return (
    <div
      className={onClick
        ? "cursor-pointer transition-all hover:shadow-md hover:border-primary/20"
        : ""
      }
      onClick={() => onClick?.(entry)}
    >
      {/* Header: head + badges, then pronunciation row (matches mobile full) */}
      <div className="mb-6">
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
      {entry.phonetic_detail && typeof entry.phonetic_detail === 'object' && (
        <div className="mb-6 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground/70">
          {Object.entries(entry.phonetic_detail).map(([key, value]) => {
            // Skip keys shown prominently in the header
            if (key === 'romaji' || key === 'pinyin' || key === 'jyutping') return null;
            // Skip raw representations of the already-displayed pronunciation
            if (key === 'pinyin_numeric' || key === 'kana') return null;
            // Skip IPA if it matches the pronunciation already shown
            if (key === 'ipa' && value === entry.pronunciation) return null;
            if (typeof value === 'string' && value) {
              return <span key={key}>{key}: {value}</span>;
            }
            return null;
          })}
        </div>
      )}

      {/* Footer source + save */}
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          {sourceLine}
        </div>
        {saveContext && saveBtn('default')}
      </div>
    </div>
  );
}
