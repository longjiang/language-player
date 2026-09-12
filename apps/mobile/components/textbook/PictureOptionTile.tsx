import React, { useMemo, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { createAssetResolver } from '@langplayer/textbooks';
import { ASSET_BASE_URL } from '@/lib/asset-url';
import { TokenizedText } from '@/components/TokenizedText';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';

/** The caption's size, so an inline tokenized label keeps the tile's own type scale. */
const LABEL_FONT_SIZE = 14;

/**
 * One picture in a picture set, as a pickable tile: the picture, its letter and its
 * label.
 *
 * Extracted because two places now offer the same choice — the set's own grid in the
 * task body, and the dialog a blank opens (SPEC-095 §Picture choices) — and the
 * fallback behaviour is the part that must not drift between them: a picture that
 * fails to load degrades to a labelled tile that stays pickable, because the letter is
 * the answer either way, and carries an **inline retry** that re-requests just that
 * image (SPEC-095 §States).
 *
 * **The label is tokenized, and therefore sits outside the pick button.** These captions
 * are the exercise's vocabulary — `请到检票口检票`, `请在安全白线内通行` — so a student has to
 * be able to tap a word and read what it means. A token inside the button would take the
 * tap for the dictionary *and* pick the letter, changing the answer as a side effect of
 * looking a word up. Splitting them keeps the two intentions apart — the picture picks,
 * the caption teaches — and the button still carries the whole label as its accessible
 * name, so nothing is lost to a screen reader.
 *
 * `inline` with `inlineFontSize`, because the ruby and definition paths render tokens
 * inside `View`s that a parent `Text`'s size cannot reach.
 */
export function PictureOptionTile({
  item,
  selected,
  disabled,
  onPick,
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
}) {
  const t = useT();
  const { l2Lang } = useLanguage();
  const resolve = useMemo(() => createAssetResolver(ASSET_BASE_URL), []);
  const [broken, setBroken] = useState(false);
  // A different URI is what makes RN Image fetch again rather than reuse the failure.
  const [retryToken, setRetryToken] = useState(0);

  // An option with no picture at all is not a failed load: it shows its label and offers no
  // retry, because there is nothing to re-request.
  const hasPicture = Boolean(item.image);
  const url = item.image ? resolve(item.image) : '';
  const uri = retryToken === 0 ? url : `${url}${url.includes('?') ? '&' : '?'}retry=${retryToken}`;
  const placeholder = broken || !hasPicture;

  return (
    <View className="relative">
      <View
        className={`gap-1.5 rounded-lg border p-2 ${
          selected ? 'border-primary bg-primary/10' : 'border-border bg-card'
        } ${disabled ? 'opacity-90' : ''}`}
      >
        <Pressable
          onPress={() => onPick(item.letter)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityState={{ selected: !!selected, disabled: !!disabled }}
          accessibilityLabel={`${item.label ? `${item.letter}. ${item.label}` : item.letter}`}
          className="w-full overflow-hidden rounded bg-muted/50"
        >
          <View className="aspect-[4/3] w-full items-center justify-center overflow-hidden">
            {placeholder ? (
              // RN allows a nested Pressable, so the retry lives with the fallback. The
              // tile stays pickable either way: the letter is the answer.
              <Pressable
                onPress={() => {
                  if (!hasPicture) return;
                  setBroken(false);
                  setRetryToken((n) => n + 1);
                }}
                disabled={!hasPicture}
                accessibilityRole={hasPicture ? 'button' : undefined}
                accessibilityLabel={t('action.retry')}
                className="items-center gap-1 px-2"
              >
                <Text className="text-center text-xs text-muted-foreground">{item.label}</Text>
                {hasPicture ? <Text className="text-xs text-primary">{t('action.retry')}</Text> : null}
              </Pressable>
            ) : (
              <Image
                source={{ uri }}
                resizeMode="cover"
                className="h-full w-full"
                onError={() => setBroken(true)}
              />
            )}
          </View>
        </Pressable>

        <View className="flex-row flex-wrap items-baseline gap-x-1">
          {/* The letter is part of the button's accessible name; here it is the caption's
              marker, matching what the workbook prints beside the picture. */}
          <Text className="text-sm font-semibold text-primary">{item.letter}</Text>
          <TokenizedText
            text={item.label}
            l2Code={l2Lang.code}
            inline
            inlineFontSize={LABEL_FONT_SIZE}
          />
        </View>
      </View>
    </View>
  );
}
