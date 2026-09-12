'use client';

import React from 'react';
import type { DialogueStimulus } from '@langplayer/textbooks';
import { useLanguage } from '@/providers/language-provider';
import { TokenizedText } from '@/components/tokenized-text';

/**
 * Speaker-labelled L2 lines carrying inline blanks.
 *
 * Each line is its own `TokenizedText`, which is what keeps blanks interactive on
 * mobile: a whole dialogue in one tokenized block would take the plain inline
 * path there, where blanks degrade to read-only.
 *
 * The speaker label is printed only when it changes, so a back-and-forth reads
 * as a conversation rather than a repeated name column.
 */
export function DialoguePassage({ dialogue }: { dialogue: DialogueStimulus }) {
  const { l2 } = useLanguage();

  return (
    <div className="flex flex-col gap-2">
      {dialogue.lines.map((line, i) => {
        const previous = dialogue.lines[i - 1]?.speaker;
        const showSpeaker = Boolean(line.speaker) && line.speaker !== previous;
        return (
          <div key={i} className="flex gap-3">
            <span className="w-16 shrink-0 pt-0.5 text-sm font-medium text-muted-foreground">
              {showSpeaker ? line.speaker : ''}
            </span>
            <div className="min-w-0 flex-1 text-foreground">
              <TokenizedText text={line.text} l2Code={l2.code} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
