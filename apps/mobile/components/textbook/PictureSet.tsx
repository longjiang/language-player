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
                  <Text className="px-2 text-center text-xs text-muted-foreground">
                    {item.label}
                  </Text>
                ) : (
                  <Image
                    source={{ uri: resolve(item.image) }}
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
