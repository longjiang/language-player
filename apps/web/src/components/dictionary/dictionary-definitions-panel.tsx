'use client';

import type { DictionaryEntry, SavedWordContext } from '@langplayer/shared';
import { BookOpen, ExternalLink } from 'lucide-react';
import { SaveButton } from '@/components/save-button';
import { SpeakButton } from '@/components/speak-button';
import { formatPronunciation } from '@langplayer/utils';
import { useT } from '@/hooks/use-t';
import { useScriptPreference } from '@/hooks/use-script-preference';

interface DictionaryDefinitionsPanelProps {
  entry: DictionaryEntry;
  /** Language-specific level label formatter */
  levelLabel?: (scale: string, value: string | number) => string;
  /** Context for the save/bookmark button. */
  saveContext?: SavedWordContext;
  /** Pre-formatted pronunciation. */
  pronunciation?: string | null;
  /** ISO 639-1 code of the target language. */
  l2Code?: string;
  /** ISO 639-1 code of the user's L1. */
  l1Code?: string;
  /** WAI-ARIA heading level for the headword (defaults to h2). */
  headingLevel?: 'h1' | 'h2' | 'h3';
}

/**
 * Renders the definitions and metadata for a dictionary entry as a standalone panel.
 * This is the "definitions panel" sibling to the "tabs panel" in the ADR 0007
 * two-column detail layout. No tabs — just head, pronunciation, definitions,
 * classifiers, study materials, and source.
 */
export function DictionaryDefinitionsPanel({
  entry,
  levelLabel,
  saveContext,
  pronunciation,
  l2Code,
  l1Code,
  headingLevel = 'h2',
}: DictionaryDefinitionsPanelProps) {
  const t = useT();
  const { apply } = useScriptPreference(l2Code ?? '');
  const { head, alternate } = apply(entry.head, entry.alternate);

  const HeadTag = headingLevel;

  const levels = entry.levels ?? [];
  const levelTexts = levels.map((l) => levelLabel
    ? levelLabel(l.scale, l.value)
    : `${l.scale.replace('_', ' ').toUpperCase()}: ${l.value}`
  );

  const formattedPron = pronunciation !== undefined
    ? pronunciation
    : formatPronunciation(entry, l2Code ?? '');

  const showAlternate = alternate && alternate !== head && alternate !== formattedPron;

  const sourceName = entry.dictionary?.name ?? entry.source;
  const displaySource = sourceName === 'AI-Generated' || sourceName === 'LLM'
    ? t('label.ai_generated')
    : sourceName;

  const googleImagesUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(entry.head)}`;

  return (
    <div>
      {/* Header: head + pronunciation + badges */}
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
              {levelTexts.map((text, i) => (
                <span key={i} className="rounded-md bg-blue-100 px-2.5 py-1 text-sm font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  {text}
                </span>
              ))}
              {entry.part_of_speech && (
                <span className="rounded-md bg-muted px-2.5 py-1 text-sm font-medium text-muted-foreground">
                  {entry.part_of_speech}
                </span>
              )}
            </div>
          </div>

          {saveContext && (
            <div>
              <SaveButton
                wordId={entry.id}
                head={entry.head}
                context={saveContext}
                size="default"
              />
            </div>
          )}
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
              <span key={i} className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-sm">
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
      {entry.studyMaterials && entry.studyMaterials.length > 0 && (
        <div className="mb-6 rounded-lg bg-blue-50/50 p-4 dark:bg-blue-950/20">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t('title.textbook_appearances')}
          </h3>
          {entry.studyMaterials.map((m, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300">
                <BookOpen className="h-4 w-4" />
                <span>
                  {t('label.textbook_format', {
                    material: m.material,
                    book: m.location?.book,
                    lesson: m.location?.lesson,
                  })}
                  {m.location?.dialog ? `, Dialog ${m.location.dialog}` : ''}
                </span>
              </div>
              {m.example && (
                <p className="text-sm" lang={l2Code}>{m.example}</p>
              )}
              {m.exampleTranslation && (
                <p className="text-sm text-muted-foreground">{m.exampleTranslation}</p>
              )}
              {i < entry.studyMaterials!.length - 1 && <hr className="my-2" />}
            </div>
          ))}
        </div>
      )}

      {/* Han script detail */}
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

      {/* Phonetic detail */}
      {entry.phonetic_detail && typeof entry.phonetic_detail === 'object' && (
        <div className="mb-6 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground/70">
          {Object.entries(entry.phonetic_detail).map(([key, value]) => {
            if (key === 'romaji' || key === 'pinyin' || key === 'jyutping') return null;
            if (key === 'pinyin_numeric') return null;
            if (key === 'ipa' && value === entry.pronunciation) return null;
            if (typeof value === 'string' && value) {
              return <span key={key}>{key}: {value}</span>;
            }
            return null;
          })}
        </div>
      )}

      {/* Source */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <BookOpen className="h-3 w-3" />
        <span>{displaySource}</span>
        <a
          href={googleImagesUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
          title={t('action.search_images')}
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
    </div>
  );
}
