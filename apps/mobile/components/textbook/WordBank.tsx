import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Bank } from '@langplayer/textbooks';
import { Image } from 'react-native';
import { createAssetResolver } from '@langplayer/textbooks';
import { ASSET_BASE_URL } from '@/lib/asset-url';
import { useT } from '@/hooks/use-t';
import { useBlankPicker } from './blank-picker';

/**
 * The option pool a `choose` blank draws from.
 *
 * Tapping an option fills the currently selected blank, mirroring the printed
 * workbook where the bank is printed once and the blanks are numbered.
 *
 * When `allowReuse` is false, options already used elsewhere are dimmed. That is
 * a per-bank flag rather than a global rule: the B ➊ key genuinely reuses the
 * letter `a`, so this is data, not an assumption.
 */
export function WordBank({ bank }: { bank: Bank }) {
  const t = useT();
  const { selected, pick, responses } = useBlankPicker();
  const resolve = createAssetResolver(ASSET_BASE_URL);

  const usedValues = new Set(Object.values(responses).filter(Boolean));
  // For a multi-select blank the options already picked are shown as chosen rather
  // than consumed, so a second tap unpicks them.
  const picked = new Set(
    (selected ? (responses[selected] ?? '') : '')
      .split(/[、,，]/)
      .map((part) => part.trim())
      .filter(Boolean),
  );

  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-2">
        {bank.items.map((item) => {
          const isPicked = picked.has(item);
          const consumed = !isPicked && !bank.allowReuse && usedValues.has(item);
          return (
            <Pressable
              key={item}
              onPress={() => pick(item)}
              accessibilityRole="button"
              accessibilityState={{ selected: isPicked }}
              className={`items-center gap-1 overflow-hidden rounded-md border ${
                bank.optionImages?.[item] ? 'w-32 pb-1.5' : 'px-3 py-1.5'
              } ${
                isPicked ? 'border-primary bg-primary/10' : consumed ? 'border-border bg-muted/40' : 'border-border bg-card'
              }`}
            >
              {bank.optionImages?.[item] ? (
                <Image
                  source={{ uri: resolve(bank.optionImages[item]!) }}
                  className="h-20 w-full rounded-t-md"
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                />
              ) : null}
              <Text
                className={`px-1 text-sm ${consumed ? 'text-muted-foreground line-through' : 'text-foreground'}`}
              >
                {bank.optionLabels?.[item] ? (
                  <>
                    <Text className="font-semibold text-primary">{item} </Text>
                    {bank.optionLabels[item]}
                  </>
                ) : (
                  item
                )}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {!selected && <Text className="text-xs text-muted-foreground">{t('msg.please_select_option')}</Text>}
    </View>
  );
}
