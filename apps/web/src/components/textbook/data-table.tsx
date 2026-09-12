'use client';

import React from 'react';
import type { DataTableStimulus } from '@langplayer/textbooks';
import { useLanguage } from '@/providers/language-provider';
import { TokenizedText } from '@/components/tokenized-text';

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
                  {row[c] ? <TokenizedText text={row[c]!} l2Code={l2.code} /> : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
