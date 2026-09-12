'use client';

import React, { useMemo, useState } from 'react';
import { createAssetResolver, type PictureSetStimulus } from '@langplayer/textbooks';
import { ASSET_BASE_URL } from '@/lib/asset-url';
import { useT } from '@/hooks/use-t';
import { useBlankPicker } from './blank-picker';
import { RetryIcon } from './retry-icon';

/**
 * A lettered grid of pictures that blanks reference by letter.
 *
 * Tapping a picture fills the currently selected blank with its letter — the
 * same interaction as the word bank, which is why both share `useBlankPicker`.
 *
 * A picture that fails to load falls back to a labelled tile rather than a
 * broken-image icon: the exercise must stay answerable when an asset is missing
 * or unpublished (SPEC-095 §States).
 */
export function PictureSet({ set }: { set: PictureSetStimulus }) {
  const t = useT();
  const resolve = useMemo(() => createAssetResolver(ASSET_BASE_URL), []);
  const { selected, pick, responses } = useBlankPicker();
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  // Bumping a token re-requests the image with a different query string, which is
  // what makes the browser fetch it again instead of serving the cached failure.
  const [retryTokens, setRetryTokens] = useState<Record<string, number>>({});

  const retry = (letter: string) => {
    setBroken((b) => {
      const next = { ...b };
      delete next[letter];
      return next;
    });
    setRetryTokens((t) => ({ ...t, [letter]: (t[letter] ?? 0) + 1 }));
  };

  const imageUrl = (key: string, token: number) =>
    token === 0 ? resolve(key) : `${resolve(key)}${resolve(key).includes('?') ? '&' : '?'}retry=${token}`;

  const usedLetters = new Set(Object.values(responses).filter(Boolean));

  return (
    <div className="flex flex-col gap-2">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {set.items.map((item) => {
          const isUsed = usedLetters.has(item.letter);
          return (
            <li key={item.letter} className="relative">
              {/* The retry is a sibling of the tile, not a child: nesting a button
                  inside one is invalid, and the tile must stay pickable even when its
                  picture is missing — the letter is the answer either way. */}
              {broken[item.letter] && (
                <button
                  type="button"
                  onClick={() => retry(item.letter)}
                  aria-label={t('action.retry')}
                  title={t('action.retry')}
                  className="absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm"
                >
                  <RetryIcon />
                </button>
              )}
              <button
                type="button"
                onClick={() => pick(item.letter)}
                disabled={!selected}
                aria-label={`${item.letter}. ${item.label}`}
                className={`flex w-full flex-col gap-1.5 rounded-lg border p-2 text-left transition-colors ${
                  isUsed ? 'border-primary/60 bg-primary/5' : 'border-border bg-card hover:bg-muted'
                } ${!selected ? 'cursor-default opacity-90' : ''}`}
              >
                <span className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded bg-muted/50">
                  {broken[item.letter] ? (
                    <span className="px-2 text-center text-xs text-muted-foreground">
                      {item.label}
                    </span>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageUrl(item.image, retryTokens[item.letter] ?? 0)}
                      alt=""
                      loading="lazy"
                      onError={() => setBroken((b) => ({ ...b, [item.letter]: true }))}
                      className="h-full w-full object-cover"
                    />
                  )}
                </span>
                <span className="text-sm text-foreground">
                  <span className="mr-1 font-semibold text-primary">{item.letter}</span>
                  {item.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {!selected && (
        <p className="text-xs text-muted-foreground">{t('msg.please_select_option')}</p>
      )}
    </div>
  );
}
