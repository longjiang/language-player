import React, { useMemo } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { createAssetResolver, pictureSetsIn, type BlankSpec } from '@langplayer/textbooks';
import { ASSET_BASE_URL } from '@/lib/asset-url';
import { useT } from '@/hooks/use-t';
import { useResponsive } from '@/hooks/use-responsive';
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
export function InlineImageSlot({
  blank,
  value,
  layout = 'inline',
}: {
  blank: BlankSpec;
  value: string;
  /**
   * Where the box is printed. `inline` is the box inside running text; `gutter` is the
   * column a passage puts beside itself on a wide screen (B ➎), where the box widens to
   * its column and the picture is shown whole instead of cropped into a fixed 128×80.
   */
  layout?: 'inline' | 'gutter';
}) {
  const t = useT();
  const ctx = useTextbookTask();
  const choice = useBlankChoice();
  const resolve = useMemo(() => createAssetResolver(ASSET_BASE_URL), []);
  // A phone has no gutter to put the box in; below `md` it keeps its printed size and
  // stacks under the paragraph.
  const { isMd } = useResponsive();
  const gutter = layout === 'gutter' && isMd;

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
      className={`items-center justify-center overflow-hidden rounded-md border-2 border-dashed ${
        gutter ? 'min-h-[96px] w-full' : 'h-24 w-32'
      } ${isSelected ? 'border-primary' : 'border-border'}`}
    >
      {item ? (
        <>
          <Image
            source={{ uri: resolve(item.image!) }}
            // Uncropped in the gutter: these are 900×487 workbook screenshots, and
            // `cover` in a fixed 128×96 box cut off about 40% of the picture.
            className={gutter ? 'h-24 w-full' : 'h-20 w-full'}
            resizeMode={gutter ? 'contain' : 'cover'}
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
