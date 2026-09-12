import React, { useMemo, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { createAssetResolver, type ImageMapStimulus } from '@langplayer/textbooks';
import { ASSET_BASE_URL } from '@/lib/asset-url';
import { useTextbookTask } from './task-provider';
import { BlankField } from './BlankField';

/**
 * An image with interactive blanks positioned over it.
 *
 * A ➊'s map already carries the printed city names and their `( )` brackets, so a pin
 * only places the blank inside that slot — the widget adds no labels of its own. Pins
 * are anchored to the **bracket**, not to the leader line's dot: the bracket is where
 * the workbook tells the student to write, so the cell the letter goes into lands on
 * the blank rather than on the map.
 *
 * Pin coordinates are percentages of the image, and the image is laid out at a
 * fixed aspect ratio so `onLayout` can convert those percentages into points.
 * Positioning RN children by percentage strings is unreliable across platforms,
 * so the measured size is used explicitly.
 */
export function ImageMap({ map }: { map: ImageMapStimulus }) {
  const ctx = useTextbookTask();
  const resolve = useMemo(() => createAssetResolver(ASSET_BASE_URL), []);
  const [broken, setBroken] = useState(false);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const blanks = ctx?.task.blanks ?? {};

  if (broken) {
    // A missing map must not hide the exercise: the blanks still render in a
    // list so the task stays answerable.
    return (
      <View className="flex-row flex-wrap gap-x-5 gap-y-3 rounded-lg border border-border bg-muted/20 p-4">
        {map.pins.map((pin) => {
          const blank = blanks[pin.blankId];
          if (!blank) return null;
          return (
            <View key={pin.blankId} className="flex-row items-center gap-1.5">
              <BlankField blank={blank} variant="cell" />
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View className="overflow-hidden rounded-lg border border-border bg-muted/20">
      <View
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setSize({ width, height });
        }}
      >
        <Image
          source={{ uri: resolve(map.image) }}
          accessible
          accessibilityLabel={map.alt ?? ''}
          resizeMode="contain"
          style={{ width: '100%', aspectRatio: 640 / 400 }}
          onError={() => setBroken(true)}
        />

        {size &&
          map.pins.map((pin) => {
            const blank = blanks[pin.blankId];
            if (!blank) return null;
            // A worked example is already printed on the map — 西安 carries its A in the
            // bracket — so drawing it again would double the letter. `given` blanks are
            // not scored, so nothing is lost by leaving it to the image.
            if (blank.kind === 'given') return null;
            return (
              <View
                key={pin.blankId}
                style={{
                  position: 'absolute',
                  left: (pin.x / 100) * size.width,
                  top: (pin.y / 100) * size.height,
                  // The pin is a centre point; shift by half the cell so it lands
                  // centred in the printed bracket rather than beside it.
                  transform: [{ translateX: -18 }, { translateY: -12 }],
                }}
              >
                <BlankField blank={blank} variant="cell" />
              </View>
            );
          })}
      </View>
    </View>
  );
}
