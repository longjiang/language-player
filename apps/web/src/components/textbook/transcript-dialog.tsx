'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { transcriptsIn, type AudioTrack, type TranscriptLine } from '@langplayer/textbooks';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TokenizedText } from '@/components/tokenized-text';
import { useLanguage } from '@/providers/language-provider';
import { useSettingsContext } from '@/providers/settings-provider';
import { useT } from '@/hooks/use-t';
import { useTextbookTask } from './task-provider';
import { useTranscriptTranslation } from './use-transcript-translation';

/**
 * A recording's transcript, on demand (SPEC-095 §Transcript).
 *
 * ## Why a dialog and not the page
 *
 * The transcript is the answer to a listening task. Putting it on the page would make
 * every listening exercise a reading exercise, and the workbook itself keeps it in a
 * separate booklet for that reason. Behind a button, a student who did not catch a word
 * can check what was said — the same choice the booklet offers — without the page
 * answering the question for them.
 *
 * ## Why a tokenized line, not a blob
 *
 * Each line is its own `TokenizedText`, so the transcript is the same L2 text as
 * everywhere else in the app: readings above the characters, every word tappable into
 * the dictionary, and (when the student has translation on) an L1 line underneath.
 * A transcript the student cannot look a word up in would be strictly worse than the
 * booklet.
 *
 * ## One dialog per task
 *
 * As with the picture choices, the dialog is rendered once by the task and every control
 * calls `open(key)`: a task can carry nine recordings (A ➊) and nine dialogs is nine
 * focus traps waiting to be open at once.
 */

interface TranscriptDialogValue {
  /** Open the transcript of a recording, by asset key. */
  open: (key: string) => void;
}

const TranscriptDialogContext = createContext<TranscriptDialogValue | null>(null);

/** The task's transcript opener, or null outside a task. */
export function useTranscriptDialog(): TranscriptDialogValue | null {
  return useContext(TranscriptDialogContext);
}

/**
 * Every transcript in the book, by recording key.
 *
 * Keyed by recording rather than by task because five tasks replay someone else's file —
 * see `transcriptsIn`. Memoized on the book, which is a prop of the page and therefore
 * stable for the life of the task.
 */
export function useTaskTranscripts(): Map<string, TranscriptLine[]> {
  const ctx = useTextbookTask();
  const book = ctx?.book;
  return useMemo(() => (book ? transcriptsIn(book) : new Map<string, TranscriptLine[]>()), [book]);
}

/**
 * The play control's transcript button.
 *
 * Renders nothing when the recording has no transcript — E ➊/➋ are dictation, where the
 * recording says the answer, and one D recording has no printed text — so a widget can
 * place it unconditionally beside its play control.
 */
export function TranscriptButton({ track, className }: { track: AudioTrack; className?: string }) {
  const t = useT();
  const dialog = useTranscriptDialog();
  const transcripts = useTaskTranscripts();

  if (!dialog || !transcripts.has(track.key)) return null;

  return (
    <button
      type="button"
      onClick={() => dialog.open(track.key)}
      aria-label={t('title.transcript')}
      title={t('title.transcript')}
      className={
        className ??
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
      }
    >
      <FileText size={13} aria-hidden />
    </button>
  );
}

export function TranscriptDialogProvider({ children }: { children: React.ReactNode }) {
  const t = useT();
  const { l1, l2 } = useLanguage();
  const { getL2 } = useSettingsContext();
  const transcripts = useTaskTranscripts();
  const [openKey, setOpenKey] = useState<string | null>(null);

  const open = useCallback((key: string) => setOpenKey(key), []);
  const value = useMemo<TranscriptDialogValue>(() => ({ open }), [open]);

  const lines = openKey ? (transcripts.get(openKey) ?? null) : null;
  const texts = useMemo(() => lines?.map((line) => line.text) ?? [], [lines]);

  // The per-L2 display setting the readers and the instructions already share: on, the
  // student reads the transcript with a translation under each line.
  const showTranslation = getL2(l2.code).display.translation;
  const translations = useTranscriptTranslation(texts, l1.code, l2.code, showTranslation);

  return (
    <TranscriptDialogContext.Provider value={value}>
      {children}

      <Dialog
        open={Boolean(lines)}
        onOpenChange={(next) => {
          if (!next) setOpenKey(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            {/* Deliberately not the recording's `label`: in A ➊ the label is the city the
                recording names, which is what the student has to work out, and in the
                dictation tasks it is the answer. The transcript's own text is the answer
                here, so the title names the feature and nothing else. */}
            <DialogTitle>{t('title.transcript')}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            {lines?.map((line, i) => {
              // Print the speaker only when it changes, so a back-and-forth reads as a
              // conversation rather than a repeated name column — as `DialoguePassage`
              // does on the page.
              const previous = lines[i - 1]?.speaker;
              const showSpeaker = Boolean(line.speaker) && line.speaker !== previous;
              const translation = translations?.[i];
              return (
                <div key={i} className="flex gap-3">
                  <span className="w-16 shrink-0 pt-0.5 text-sm font-medium text-muted-foreground">
                    {showSpeaker ? line.speaker : ''}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="leading-loose text-foreground">
                      <TokenizedText text={line.text} l2Code={l2.code} />
                    </div>
                    {translation && (
                      <p className="mt-0.5 text-sm text-muted-foreground">{translation}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </TranscriptDialogContext.Provider>
  );
}
