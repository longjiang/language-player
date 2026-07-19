'use client';

import { useState } from 'react';
import type { DictionaryEntry, SavedWordContext } from '@langplayer/shared';
import { BookOpen, ExternalLink, Film, Binary, Sparkles } from 'lucide-react';
import { SaveButton } from './save-button';
import { SpeakButton } from './speak-button';
import { formatPronunciation } from '@langplayer/utils';
import { useT } from '@/hooks/use-t';
import { useScriptPreference } from '@/hooks/use-script-preference';
import { useInflectedSearchTerms } from '@/hooks/use-inflected-search-terms';
import { TabbedPanel } from '@/components/tabbed-panel';
import { SubsSearchResults } from '@/components/video/subs-search-results';
import { InflectionTable } from '@/components/inflection-table';
import { AiExplanation } from '@/components/ai-explanation';

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
  /** When true, renders without card chrome (no shadow, border, or outer padding).
   *  Use when embedding inside another card (e.g. review page). */
  embedded?: boolean;
  /** Optional surrounding text context for DeepSeek explanation. */
  contextText?: string;
  /** Optional inflected form of the word as it appears in contextText. */
  contextForm?: string;
}

/** Renders a single dictionary lookup result — compact in popups, full on detail pages. */
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
  embedded = false,
  contextText,
  contextForm,
}: DictionaryEntryCardProps) {
  const t = useT();
  const { apply } = useScriptPreference(l2Code ?? '');
  const { head, alternate } = apply(entry.head, entry.alternate);
  const isFull = variant === 'full';
  const [tab, setTab] = useState<string>('word');

  // ── Inflected search terms ──
  const { allTerms, headTerm, formCount } = useInflectedSearchTerms(entry, l2Code ?? '');
  const [exactMatch, setExactMatch] = useState(false);
  const searchTermString = exactMatch ? headTerm : allTerms.join(',');

  const levels = entry.levels ?? [];
  const levelTexts = levels.map((l) => levelLabel
    ? levelLabel(l.scale, l.value)
    : `${l.scale.replace('_', ' ').toUpperCase()}: ${l.value}`
  );

  const formattedPron = pronunciation !== undefined
    ? pronunciation
    : formatPronunciation(entry, l2Code ?? '');

  // Hide alternate when it duplicates the head or pronunciation
  const showAlternate = alternate && alternate !== head && alternate !== formattedPron;

  const studyMaterials = entry.studyMaterials;

  // ── Study material indicator (compact) ──
  const studyMaterialLine = studyMaterials && studyMaterials.length > 0 ? (
    <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
      <BookOpen className="h-3 w-3" />
      <span>
        {studyMaterials.map((m, i) => (
          <span key={i}>
            {t('label.study_material_format', { material: m.material, book: m.location?.book, lesson: m.location?.lesson })}
            {i < studyMaterials.length - 1 ? ', ' : ''}
          </span>
        ))}
      </span>
    </div>
  ) : null;

  // ── Shared: level + POS badges ──
  const badges = (
    <>
      {levelTexts.map((text, i) => (
        <span key={i} className={isFull
          ? "rounded-md bg-blue-100 px-2.5 py-1 text-sm font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200"
          : "ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
        }>
          {text}
        </span>
      ))}
      {entry.part_of_speech && (
        <span className={isFull
          ? "rounded-md bg-muted px-2.5 py-1 text-sm font-medium text-muted-foreground"
          : "shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
        }>
          {entry.part_of_speech}
        </span>
      )}
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
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold" lang={l2Code}>{head}</span>
          {showAlternate && (
            <span className="text-xs text-muted-foreground" lang={l2Code}>{alternate}</span>
          )}
          {formattedPron && (
            <span className="text-xs text-muted-foreground">{formattedPron}</span>
          )}
          {badges}
        </div>

        {/* Definitions */}
        {entry.definitions.length > 0 && (
          <div className="mt-2 space-y-1">
            {entry.definitions.map((def, i) => (
              <p key={i} className="text-sm leading-relaxed">
                {entry.definitions.length > 1 && (
                  <span className="mr-1 text-xs text-muted-foreground">{i + 1}.</span>
                )}
                {def}
              </p>
            ))}
          </div>
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

  const wordContent = (
    <div
      className={onClick
        ? "cursor-pointer transition-all hover:shadow-md hover:border-primary/20"
        : ""
      }
      onClick={() => onClick?.(entry)}
    >
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-baseline gap-3">
              <HeadTag className="text-4xl font-bold" lang={l2Code}>
                {head}
              </HeadTag>
              {showAlternate && (
                <span className="text-xl text-muted-foreground" lang={l2Code}>
                  {alternate}
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3">
              {formattedPron && (
                <span className="flex items-center gap-1 text-lg text-muted-foreground" lang={l2Code}>
                  <SpeakButton text={entry.head} l2Code={l2Code ?? ''} size="default" />
                  {formattedPron}
                </span>
              )}
              {badges}
            </div>
          </div>

          {saveContext && saveBtn('default')}
        </div>
      </div>

      {/* Definitions */}
      {entry.definitions.length > 0 && (
        <div className="mb-6 rounded-lg bg-muted/40 p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t('title.definitions')}
          </h3>
          <ul className="space-y-2">
            {entry.definitions.map((def, i) => (
              <li key={i} className="flex items-start gap-2 text-base leading-relaxed">
                {entry.definitions.length > 1 && (
                  <span className="mt-0.5 flex-shrink-0 text-sm text-muted-foreground">
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
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {entry.classifier[0]!.kind === 'gender' ? t('title.gender') :
             entry.classifier[0]!.kind === 'measure_word' ? t('title.measure_words') :
             t('title.classifiers')}
          </h3>
          <div className="flex flex-wrap gap-2">
            {entry.classifier.map((cl, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-sm"
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
        <div className="mb-6 rounded-lg bg-blue-50/50 p-4 dark:bg-blue-950/20">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t('title.textbook_appearances')}
          </h3>
          {studyMaterials.map((m, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300">
                <BookOpen className="h-4 w-4" />
                <span>{t('label.textbook_format', { material: m.material, book: m.location?.book, lesson: m.location?.lesson })}{m.location?.dialog ? `, Dialog ${m.location.dialog}` : ''}</span>
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
            if (key === 'pinyin_numeric') return null;
            // Skip IPA if it matches the pronunciation already shown
            if (key === 'ipa' && value === entry.pronunciation) return null;
            if (typeof value === 'string' && value) {
              return <span key={key}>{key}: {value}</span>;
            }
            return null;
          })}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2">
        {sourceLine}
      </div>
    </div>
  );

  return (
    <div onClick={(e) => e.stopPropagation()}>
    <TabbedPanel
      tabs={[
        { key: 'word', label: t('title.dictionary'), icon: <BookOpen className="h-4 w-4" /> },
        { key: 'examples', label: t('title.examples_from_videos'), icon: <Film className="h-4 w-4" /> },
        { key: 'deepseek', label: t('action.let_ai_explain'), icon: <Sparkles className="h-4 w-4" /> },
        { key: 'inflections', label: t('title.conjugations'), icon: <Binary className="h-4 w-4" /> },
      ]}
      activeTab={tab}
      onTabChange={setTab}
      className={embedded ? 'rounded-none border-0 bg-transparent' : 'shadow-sm'}
      contentClassName={embedded ? 'px-0 pt-8' : 'p-6'}
    >
      {tab === 'word' && wordContent}
      {tab === 'examples' && (
        <SubsSearchResults
          term={searchTermString}
          exactMatch={exactMatch}
          onExactToggle={setExactMatch}
          formCount={formCount}
          embedded
        />
      )}
      {tab === 'deepseek' && (
        <AiExplanation word={head} contextText={contextText} contextForm={contextForm} entryFound={true} autoLoad />
      )}
      {tab === 'inflections' && (
        <InflectionTable head={head} l2Code={l2Code ?? ''} embedded />
      )}
    </TabbedPanel>
    </div>
  );
}
