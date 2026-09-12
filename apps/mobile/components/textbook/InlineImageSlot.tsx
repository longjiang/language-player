import React, { useMemo } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { createAssetResolver, pictureSetsIn, type BlankSpec } from '@langplayer/textbooks';
import { ASSET_BASE_URL } from '@/lib/asset-url';
import { useT } from '@/hooks/use-t';
import { useTextbookTask } from './task-provider';
import { useBlankChoice } from './BlankChoice';

/**
 * An in-passage illustration slot (SPEC-095).
 *
 * B ➎ / ➏ ask the student to place one of a set of illustrations into the article, and
 * the booklet prints a box where the picture goes. A `choose` blank answering from a
 * `pictureSet` renders as this instead of a letter chip: the box shows the illustration
 * once picked, so the article reads as the finished page.
 *
 * Tapping the box opens the task's picture-choice dialog and picking a picture fills
 * it, exactly as a compact `cell` blank does — the same blank kind answered the same
 * way, in the two shapes the workbook prints it. This stays a rendering variant of
 * `BlankField` rather than a stimulus kind of its own.
 */
export function InlineImageSlot({ blank, value }: { blank: BlankSpec; value: string }) {
  const t = useT();
  const ctx = useTextbookTask();
  const choice = useBlankChoice();
  const resolve = useMemo(() => createAssetResolver(ASSET_BASE_URL), []);

  const set = blank.optionSet ? pictureSetsIn(ctx!.task).get(blank.optionSet) : undefined;
  const item = set?.items.find((i) => i.letter === value);
  const isSelected = ctx!.selection.get() === blank.id;

  return (
    <Pressable
      onPress={() => {
        // Opening the choices also selects the blank, which is what arms the picture
        // bank below the task; the dialog itself is where a pick is made and where an
        // answer is taken back.
        choice?.open(blank.id);
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      // When filled, the picture's own label names it — that is content, not chrome.
      accessibilityLabel={item ? item.label : t('label.pick_illustration')}
      className={`h-24 w-32 items-center justify-center overflow-hidden rounded-md border-2 border-dashed ${
        isSelected ? 'border-primary' : 'border-border'
      }`}
    >
      {item ? (
        <>
          <Image
            source={{ uri: resolve(item.image!) }}
            className="h-20 w-full"
            resizeMode="cover"
            accessible={false}
          />
          <Text className="w-full px-1 text-center text-[10px] text-muted-foreground">
            {item.label}
          </Text>
        </>
      ) : (
        <View className="items-center gap-1 px-2">
          <Text aria-hidden className="text-lg leading-none text-muted-foreground">
            🖼
          </Text>
          <Text className="text-center text-[10px] text-muted-foreground">
            {t('label.pick_illustration')}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
