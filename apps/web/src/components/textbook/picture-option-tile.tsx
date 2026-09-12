'use client';

import React, { useMemo, useState } from 'react';
import { createAssetResolver } from '@langplayer/textbooks';
import { ASSET_BASE_URL } from '@/lib/asset-url';
import { TokenizedText } from '@/components/tokenized-text';
import { useLanguage } from '@/providers/language-provider';
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
 *
 * **The label is tokenized, and therefore sits outside the pick button.** These captions
 * are the exercise's vocabulary — `请到检票口检票`, `请在安全白线内通行` — so a student has to
 * be able to tap a word and read what it means. A token inside the button would fire both
 * handlers on one tap: the dictionary would open *and* the letter would be picked, which
 * changes the answer as a side effect of looking a word up. Splitting them keeps the two
 * intentions apart — the picture picks, the caption teaches — and the button still carries
 * the whole label as its accessible name, so nothing is lost to a screen reader.
 *
 * `TokenizedText` is `inline` here: a caption inherits the tile's own size instead of the
 * reader's block-text scale, so tokenizing the caption does not resize the grid.
 */
export function PictureOptionTile({
  item,
  selected,
  disabled,
  onPick,
  className,
}: {
  /**
   * The option as a tile shows it: `letter` is what a pick records — a `pictureSet`'s letter, or
   * a bank's own item — and `image` is optional, because a bank's options may be words alone.
   */
  item: { letter: string; label: string; image?: string };
  /** The current answer names this option. */
  selected?: boolean;
  disabled?: boolean;
  onPick: (letter: string) => void;
  className?: string;
}) {
  const t = useT();
  const { l2 } = useLanguage();
  const resolve = useMemo(() => createAssetResolver(ASSET_BASE_URL), []);
  const [broken, setBroken] = useState(false);
  // Bumping a token re-requests the image with a different query string, which is what
  // makes the browser fetch it again instead of serving the cached failure.
  const [retryToken, setRetryToken] = useState(0);

  // An option with no picture at all is not a failed load: it shows its label and offers no
  // retry, because there is nothing to re-request.
  const hasPicture = Boolean(item.image);
  const url = item.image ? resolve(item.image) : '';
  const src = retryToken === 0 ? url : `${url}${url.includes('?') ? '&' : '?'}retry=${retryToken}`;
  const placeholder = broken || !hasPicture;

  return (
    <div className={className ?? 'relative'}>
      {/* The retry is a sibling of the tile, not a child: nesting a button inside one
          is invalid, and the tile must stay pickable even when its picture is missing. */}
      {broken && hasPicture && (
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

      <div
        className={`flex w-full flex-col gap-1.5 rounded-lg border p-2 transition-colors ${
          selected ? 'border-primary bg-primary/10' : 'border-border bg-card'
        } ${disabled ? 'opacity-90' : ''}`}
      >
        <button
          type="button"
          onClick={() => onPick(item.letter)}
          disabled={disabled}
          aria-pressed={selected}
          aria-label={`${item.label ? `${item.letter}. ${item.label}` : item.letter}`}
          className={`block w-full overflow-hidden rounded bg-muted/50 ${
            disabled ? 'cursor-default' : 'cursor-pointer'
          }`}
        >
          <span className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden">
            {placeholder ? (
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
        </button>

        <span className="flex flex-wrap items-baseline gap-x-1 text-sm text-foreground">
          {/* The letter is part of the button's accessible name, so it is decoration
              here rather than a second reading of it. */}
          <span className="font-semibold text-primary" aria-hidden>
            {item.letter}
          </span>
          <TokenizedText text={item.label} l2Code={l2.code} inline />
        </span>
      </div>
    </div>
  );
}
