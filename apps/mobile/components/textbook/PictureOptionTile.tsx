import React, { useMemo, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { createAssetResolver, type PictureOption } from '@langplayer/textbooks';
import { ASSET_BASE_URL } from '@/lib/asset-url';
import { useT } from '@/hooks/use-t';

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
 */
export function PictureOptionTile({
  item,
  selected,
  disabled,
  onPick,
}: {
  item: PictureOption;
  /** The current answer names this option. */
  selected?: boolean;
  disabled?: boolean;
  onPick: (letter: string) => void;
}) {
  const t = useT();
  const resolve = useMemo(() => createAssetResolver(ASSET_BASE_URL), []);
  const [broken, setBroken] = useState(false);
  // A different URI is what makes RN Image fetch again rather than reuse the failure.
  const [retryToken, setRetryToken] = useState(0);

  const url = resolve(item.image!);
  const uri = retryToken === 0 ? url : `${url}${url.includes('?') ? '&' : '?'}retry=${retryToken}`;

  return (
    <View className="relative">
      <Pressable
        onPress={() => onPick(item.letter)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ selected: !!selected, disabled: !!disabled }}
        accessibilityLabel={`${item.letter}. ${item.label}`}
        className={`gap-1.5 rounded-lg border p-2 ${
          selected ? 'border-primary bg-primary/10' : 'border-border bg-card'
        } ${disabled ? 'opacity-90' : ''}`}
      >
        <View className="aspect-[4/3] w-full items-center justify-center overflow-hidden rounded bg-muted/50">
          {broken ? (
            // RN allows a nested Pressable, so the retry lives with the fallback. The
            // tile stays pickable either way: the letter is the answer.
            <Pressable
              onPress={() => {
                setBroken(false);
                setRetryToken((n) => n + 1);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('action.retry')}
              className="items-center gap-1 px-2"
            >
              <Text className="text-center text-xs text-muted-foreground">{item.label}</Text>
              <Text className="text-xs text-primary">{t('action.retry')}</Text>
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
        <Text className="text-sm text-foreground">
          <Text className="font-semibold text-primary">{item.letter}</Text> {item.label}
        </Text>
      </Pressable>
    </View>
  );
}
