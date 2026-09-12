import React, { useMemo, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { createAssetResolver, type PictureSetStimulus } from '@langplayer/textbooks';
import { ASSET_BASE_URL } from '@/lib/asset-url';
import { useT } from '@/hooks/use-t';
import { useBlankPicker } from './blank-picker';

/**
 * A lettered grid of pictures that blanks reference by letter.
 *
 * Tapping a picture fills the currently selected blank with its letter — the
 * same interaction as the word bank, which is why both share `useBlankPicker`.
 *
 * A picture that fails to load falls back to a labelled tile: the exercise must
 * stay answerable when an asset is missing or not yet published (SPEC-095
 * §States).
 */
export function PictureSet({ set }: { set: PictureSetStimulus }) {
  const t = useT();
  const resolve = useMemo(() => createAssetResolver(ASSET_BASE_URL), []);
  const { selected, pick, responses } = useBlankPicker();
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  // A different URI is what makes RN Image fetch again rather than reuse the failure.
  const [retryTokens, setRetryTokens] = useState<Record<string, number>>({});

  const retry = (letter: string) => {
    setBroken((b) => {
      const next = { ...b };
      delete next[letter];
      return next;
    });
    setRetryTokens((t) => ({ ...t, [letter]: (t[letter] ?? 0) + 1 }));
  };

  const imageUrl = (key: string, token: number) => {
    const url = resolve(key);
    return token === 0 ? url : `${url}${url.includes('?') ? '&' : '?'}retry=${token}`;
  };

  const usedLetters = new Set(Object.values(responses).filter(Boolean));

  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-3">
        {set.items.map((item) => {
          const isUsed = usedLetters.has(item.letter);
          return (
            <Pressable
              key={item.letter}
              onPress={() => pick(item.letter)}
              disabled={!selected}
              accessibilityRole="button"
              accessibilityLabel={`${item.letter}. ${item.label}`}
              className={`w-[46%] gap-1.5 rounded-lg border p-2 ${
                isUsed ? 'border-primary/60 bg-primary/5' : 'border-border bg-card'
              }`}
            >
              <View className="aspect-[4/3] w-full items-center justify-center overflow-hidden rounded bg-muted/50">
                {broken[item.letter] ? (
                  // RN allows a nested Pressable, so the retry sits with the fallback.
                  // The tile stays pickable: the letter is the answer either way.
                  <Pressable
                    onPress={() => retry(item.letter)}
                    accessibilityRole="button"
                    accessibilityLabel={t('action.retry')}
                    className="items-center gap-1 px-2"
                  >
                    <Text className="text-center text-xs text-muted-foreground">
                      {item.label}
                    </Text>
                    <Text className="text-xs text-primary">{t('action.retry')}</Text>
                  </Pressable>
                ) : (
                  <Image
                    source={{ uri: imageUrl(item.image, retryTokens[item.letter] ?? 0) }}
                    accessible={false}
                    resizeMode="cover"
                    style={{ width: '100%', height: '100%' }}
                    onError={() => setBroken((b) => ({ ...b, [item.letter]: true }))}
                  />
                )}
              </View>
              <Text className="text-sm text-foreground">
                <Text className="font-semibold text-primary">{item.letter} </Text>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {!selected && (
        <Text className="text-xs text-muted-foreground">{t('msg.please_select_option')}</Text>
      )}
    </View>
  );
}
