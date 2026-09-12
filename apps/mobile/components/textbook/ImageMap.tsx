import React, { useMemo, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { createAssetResolver, type ImageMapStimulus } from '@langplayer/textbooks';
import { ASSET_BASE_URL } from '@/lib/asset-url';
import { useTextbookTask } from './task-provider';
import { BlankField } from './BlankField';

/**
 * An image with interactive blanks positioned over it.
 *
 * A ➊'s map already carries the printed city names and their `( )` brackets, so a
 * pin only places the blank over that slot — the widget adds no labels of its own.
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
              <BlankField blank={blank} />
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
            return (
              <View
                key={pin.blankId}
                style={{
                  position: 'absolute',
                  left: (pin.x / 100) * size.width,
                  top: (pin.y / 100) * size.height,
                  // The pin is a centre point; shift by roughly half a blank so
                  // the control lands on the printed bracket rather than beside it.
                  transform: [{ translateX: -14 }, { translateY: -12 }],
                }}
              >
                <BlankField blank={blank} />
              </View>
            );
          })}
      </View>
    </View>
  );
}
