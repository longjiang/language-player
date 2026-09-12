import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'react-native';
import { bankIsPicked, createAssetResolver, type Bank } from '@langplayer/textbooks';
import { ASSET_BASE_URL } from '@/lib/asset-url';
import { TokenizedText } from '@/components/TokenizedText';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { useTextbookTask } from './task-provider';
import { useBlankPicker } from './blank-picker';

/** The option's size, so an inline tokenized word keeps the bank's own type scale. */
const OPTION_FONT_SIZE = 14;

/**
 * The option pool a blank draws from.
 *
 * Two shapes, and which one applies is a property of the **blank**, not of the bank:
 *
 * - **Picked** (`choose` blanks): tapping an option fills the currently selected blank, as
 *   the printed workbook's banks work. The letter or word *is* the answer, so the options
 *   have to be controls.
 * - **A reference list** (`type` blanks): the student writes the answer, so the pool is text
 *   to read rather than a row of controls — A ➍ prints three words under each summary and the
 *   student types them in. Buttons there would invite picking, which is not the exercise, and
 *   a `Pressable` around a token takes the word's tap away from the dictionary.
 *
 * The words are tokenized in both shapes: they are L2 the student may not know, and looking
 * one up is what the pool is for.
 *
 * **A word the student has used is struck out, whatever `allowReuse` says.** The strike means
 * "you have placed this", which is what a student working down a summary needs to see — and it
 * has to survive reuse: A ➍ (4) uses 摇 twice, so the second use has to still be findable in a
 * pool of three words. `allowReuse` describes the answer key (may this word appear twice?); it
 * does not mean the word has not been used. An option is still pressable when struck.
 *
 * `given` blanks do not count as used: their answers are pre-filled in the store, so counting
 * them would strike out A ➍ (1)'s entire pool — the printed worked example — before the student
 * has done anything.
 */
export function WordBank({ bank }: { bank: Bank }) {
  const t = useT();
  const { l2Lang } = useLanguage();
  const ctx = useTextbookTask();
  const { selected, pick, responses } = useBlankPicker();
  const resolve = createAssetResolver(ASSET_BASE_URL);

  const picked = ctx ? bankIsPicked(ctx.task, bank.id) : true;
  const usedValues = new Set(
    Object.entries(responses)
      .filter(([id, value]) => value && ctx?.task.blanks?.[id]?.kind !== 'given')
      .map(([, value]) => value),
  );
  // For a multi-select blank the options already picked are shown as chosen rather
  // than consumed, so a second tap unpicks them.
  const chosenValues = new Set(
    (selected ? (responses[selected] ?? '') : '')
      .split(/[、,，]/)
      .map((part) => part.trim())
      .filter(Boolean),
  );

  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-2">
        {bank.items.map((item) => {
          const chosen = chosenValues.has(item);
          const consumed = !chosen && usedValues.has(item);
          const label = bank.optionLabels?.[item];
          const image = bank.optionImages?.[item];

          // `justify-end`, not the default: a ruby reading enlarges the line box and pushes
          // the base glyph down, so without it a pool shows options whose characters sit at
          // different heights depending on whether their reading has arrived. Pinning the
          // content to the bottom puts the shared baseline at a fixed offset and lets the
          // reading grow upward, which is what makes every chip reserve the reading space for
          // the others — the row stretches each chip to the tallest.
          const skin = `items-center justify-end gap-1 overflow-hidden rounded-md border ${
            image ? 'w-32 pb-1.5' : 'px-3 py-1.5'
          } ${
            chosen
              ? 'border-primary bg-primary/10'
              : consumed
                ? 'border-border bg-muted/40'
                : picked
                  ? 'border-border bg-card'
                  : 'border-border bg-muted/30'
          }`;

          const body = (
            <>
              {image ? (
                <Image
                  source={{ uri: resolve(image) }}
                  className="h-20 w-full rounded-t-md"
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                />
              ) : null}
              <View className="flex-row flex-wrap items-baseline gap-x-1 px-1">
                {/* An option answered by a letter prints the letter; a typed pool is only its
                    words, and a bare letter there would be content rather than a marker. */}
                {label ? <Text className="text-sm font-semibold text-primary">{item}</Text> : null}
                <TokenizedText
                  text={label ?? item}
                  l2Code={l2Lang.code}
                  inline
                  inlineFontSize={OPTION_FONT_SIZE}
                />
              </View>
            </>
          );

          // A reference list is not a control: no press target, so a tap on a word is the
          // dictionary's and nothing else.
          if (!picked) {
            return (
              <View key={item} className={skin}>
                {body}
              </View>
            );
          }

          return (
            <Pressable
              key={item}
              onPress={() => pick(item)}
              accessibilityRole="button"
              accessibilityState={{ selected: chosen }}
              className={skin}
            >
              {body}
            </Pressable>
          );
        })}
      </View>
      {picked && !selected && (
        <Text className="text-xs text-muted-foreground">{t('msg.please_select_option')}</Text>
      )}
    </View>
  );
}
