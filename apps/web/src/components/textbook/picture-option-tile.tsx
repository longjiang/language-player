'use client';

import React, { useMemo, useState } from 'react';
import { createAssetResolver, type PictureOption } from '@langplayer/textbooks';
import { ASSET_BASE_URL } from '@/lib/asset-url';
import { useT } from '@/hooks/use-t';
import { RetryIcon } from './retry-icon';

/**
 * One picture in a picture set, as a pickable tile: the picture, its letter and its
 * label.
 *
 * Extracted because two places now offer the same choice — the set's own grid in the
 * task body, and the modal a blank opens (SPEC-095 §Picture choices) — and the fallback
 * behaviour is the part that must not drift between them: a picture that fails to load
 * degrades to a labelled tile that stays pickable, because the letter is the answer
 * either way, and carries an **inline retry** that re-requests just that image
 * (SPEC-095 §States).
 */
export function PictureOptionTile({
  item,
  selected,
  disabled,
  onPick,
  className,
}: {
  item: PictureOption;
  /** The current answer names this option. */
  selected?: boolean;
  disabled?: boolean;
  onPick: (letter: string) => void;
  className?: string;
}) {
  const t = useT();
  const resolve = useMemo(() => createAssetResolver(ASSET_BASE_URL), []);
  const [broken, setBroken] = useState(false);
  // Bumping a token re-requests the image with a different query string, which is what
  // makes the browser fetch it again instead of serving the cached failure.
  const [retryToken, setRetryToken] = useState(0);

  const url = resolve(item.image!);
  const src = retryToken === 0 ? url : `${url}${url.includes('?') ? '&' : '?'}retry=${retryToken}`;

  return (
    <div className={className ?? 'relative'}>
      {/* The retry is a sibling of the tile, not a child: nesting a button inside one
          is invalid, and the tile must stay pickable even when its picture is missing. */}
      {broken && (
        <button
          type="button"
          onClick={() => {
            setBroken(false);
            setRetryToken((n) => n + 1);
          }}
          aria-label={t('action.retry')}
          title={t('action.retry')}
          className="absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm"
        >
          <RetryIcon />
        </button>
      )}
      <button
        type="button"
        onClick={() => onPick(item.letter)}
        disabled={disabled}
        aria-pressed={selected}
        aria-label={`${item.letter}. ${item.label}`}
        className={`flex w-full flex-col gap-1.5 rounded-lg border p-2 text-left transition-colors ${
          selected ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-muted'
        } ${disabled ? 'cursor-default opacity-90' : ''}`}
      >
        <span className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded bg-muted/50">
          {broken ? (
            <span className="px-2 text-center text-xs text-muted-foreground">{item.label}</span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt=""
              loading="lazy"
              onError={() => setBroken(true)}
              className="h-full w-full object-cover"
            />
          )}
        </span>
        <span className="text-sm text-foreground">
          <span className="mr-1 font-semibold text-primary">{item.letter}</span>
          {item.label}
        </span>
      </button>
    </div>
  );
}
