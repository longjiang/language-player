import React, { useRef, useState } from 'react';
import { View, Image } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';

/**
 * Shared full-size zoomable image for reader preview modals (image reader and
 * PDF page preview). Tap toggles zoom (1× ↔ 2×), pinch zooms continuously, and
 * drag pans while zoomed. Extracted from the image reader so the PDF reader's
 * page preview behaves identically.
 */
export function ZoomableImage({ uri }: { uri: string }) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const startZoomRef = useRef(1);
  const startTranslateRef = useRef({ x: 0, y: 0 });

  const tap = Gesture.Tap()
    .runOnJS(true)
    .maxDuration(250)
    .onEnd(() => {
      if (scale > 1) {
        setScale(1);
        setTranslate({ x: 0, y: 0 });
      } else {
        setScale(2);
      }
    });

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => { startZoomRef.current = scale; })
    .onUpdate((e) => {
      setScale(Math.min(4, Math.max(1, Math.round(startZoomRef.current * e.scale * 100) / 100)));
    })
    .onEnd(() => { if (scale < 1) setScale(1); });

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onStart(() => { startTranslateRef.current = translate; })
    .onUpdate((e) => {
      if (scale > 1) {
        setTranslate({
          x: startTranslateRef.current.x + e.translationX,
          y: startTranslateRef.current.y + e.translationY,
        });
      }
    });

  const composed = Gesture.Simultaneous(pinch, pan, tap);

  return (
    <GestureHandlerRootView className="flex-1 bg-black">
      <GestureDetector gesture={composed}>
        <View className="flex-1 items-center justify-center" style={{ transform: [{ translateX: translate.x }, { translateY: translate.y }, { scale }] }}>
          <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
        </View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}
