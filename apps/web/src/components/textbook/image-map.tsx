'use client';

import React, { useMemo, useState } from 'react';
import { createAssetResolver, type ImageMapStimulus } from '@langplayer/textbooks';
import { ASSET_BASE_URL } from '@/lib/asset-url';
import { useTextbookTask } from './task-provider';
import { BlankField } from './blank-field';

/**
 * An image with interactive blanks positioned over it.
 *
 * A ➊'s map already carries the printed city names and their `( )` brackets, so a
 * pin only places the blank over that slot — the widget adds no labels of its
 * own, which is what keeps the map looking like the workbook.
 *
 * Pin coordinates are percentages, so the map scales without re-authoring: a
 * student's zoom setting changes the rendered size but not the layout.
 */
export function ImageMap({ map }: { map: ImageMapStimulus }) {
  const ctx = useTextbookTask();
  const resolve = useMemo(() => createAssetResolver(ASSET_BASE_URL), []);
  const [broken, setBroken] = useState(false);
  const blanks = ctx?.task.blanks ?? {};

  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-border bg-muted/20">
      {broken ? (
        // A missing map must not hide the exercise: the blanks still render in a
        // list so the task stays answerable.
        <ul className="flex flex-wrap gap-x-6 gap-y-3 p-4">
          {map.pins.map((pin) => {
            const blank = blanks[pin.blankId];
            if (!blank) return null;
            return (
              <li key={pin.blankId} className="flex items-center gap-1.5">
                <BlankField blank={blank} variant="cell" />
              </li>
            );
          })}
        </ul>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolve(map.image)}
            alt={map.alt ?? ''}
            onError={() => setBroken(true)}
            className="block h-auto w-full"
          />
          {map.pins.map((pin) => {
            const blank = blanks[pin.blankId];
            if (!blank) return null;
            // A worked example is already printed on the map — 西安 carries its A in
            // the bracket — so drawing it again would double the letter. `given`
            // blanks are not scored, so nothing is lost by leaving it to the image.
            if (blank.kind === 'given') return null;
            return (
              <span
                key={pin.blankId}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{
                  // Both axes are the printed bracket's own centre (see the pins in
                  // lesson-a.ts), and the cell is small enough that centring it there
                  // never puts half of it outside the frame — the clamp that used to
                  // shift the old 96px-tall illustration slot at the image's bottom
                  // edge is gone, because it would now move the cell off the bracket.
                  left: `${pin.x}%`,
                  top: `${pin.y}%`,
                }}
              >
                {/* The map prints the city name and its `( )` brackets, so the pin is a
                    compact cell the letter goes into — not the 128x96 illustration box
                    the passage variant draws, which would cover the map it sits on. */}
                <BlankField blank={blank} variant="cell" />
              </span>
            );
          })}
        </>
      )}
    </div>
  );
}
