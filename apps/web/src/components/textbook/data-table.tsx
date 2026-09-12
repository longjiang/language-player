'use client';

import React from 'react';
import type { DataTableStimulus } from '@langplayer/textbooks';
import { useLanguage } from '@/providers/language-provider';
import { TokenizedText } from '@/components/tokenized-text';
import { InlineTrackButton } from './inline-track-button';

/**
 * Tabular stimulus.
 *
 * Cells are rendered through `TokenizedText`, so a cell may carry `{{bN}}`
 * markers and the blanks appear inline in the table — which is how B ➊ puts a
 * blank in the 车型 column and A ➌ puts two per row. The table therefore needs no
 * blank mechanism of its own.
 *
 * Cells are tokenized individually rather than pre-tokenized as a block: a table
 * cell is a short phrase (or a bare blank), and the lemmatize queue batches them.
 *
 * A row's audio control is placed in its first cell when any blank in that row is
 * an anchor for a track. A ➌ anchors each speaker's recording to the first blank of
 * their row, so the button lands beside the name — which is where the audio is
 * heard and answered. `blankIdsIn` reads the row's `{{bN}}` markers, since a row is
 * plain strings and has no ids of its own.
 */
export function DataTable({ table }: { table: DataTableStimulus }) {
  const { l2 } = useLanguage();

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {table.columns.map((column, i) => (
              <th
                key={i}
                className="border border-border bg-muted/40 px-3 py-2 text-left font-medium text-foreground"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r}>
              {table.columns.map((_, c) => (
                <td key={c} className="border border-border px-3 py-2 align-middle text-foreground">
                  {/*
                    NOT `inline`: on mobile the inline path renders inside a single
                    RN <Text>, where an interactive blank cannot live — it degrades
                    to read-only. A table cell holds real blanks (B ➊, A ➌), so it
                    must take the flex path on both platforms.
                  */}
                  <span className="flex items-center gap-2">
                    {c === 0 && <InlineTrackButton tracks={row.audio} />}
                    {/* The row's glyph, if it has one: decoration beside the text rather than
                        text itself, so the cell stays pure vocabulary the student can tap. */}
                    {c === 0 && row.icon ? (
                      <span aria-hidden className="shrink-0 text-base leading-none">
                        {row.icon}
                      </span>
                    ) : null}
                    {row.cells[c] ? (
                      // A ➌'s blanks answer from picture sets and the workbook prints them as
                      // small letter blanks, so the cell variant is what belongs in a cell.
                      <TokenizedText text={row.cells[c]!} l2Code={l2.code} blankVariant="cell" />
                    ) : null}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
