// @/components/ResizablePanel.tsx

import React, { useState, useEffect } from 'react';
import { StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedGestureHandler,
} from 'react-native-reanimated';
import { PanGestureHandler, GestureHandlerRootView } from 'react-native-gesture-handler';

export const ResizablePanel = ({
  children,
  minHeight = 70,
  maxHeight = Dimensions.get('window').height,
  minBottom = 100,
  colorFrom = 'purple',
  colorTo = 'green',
  visible = false,
  onMaximize,
  onMinimize,
}) => {
  if (!visible) {
    return null;
  }

  const [isMinimized, setIsMinimized] = useState(false);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (isMinimized) {
      onMinimize && onMinimize();
    } else {
      onMaximize && onMaximize();
    }
  }, [isMinimized, onMinimize, onMaximize]);

  const handleGesture = useAnimatedGestureHandler({
    onStart: (_, context) => {
      context.startY = progress.value;
    },
    onActive: (event, context) => {
      const newProgress = context.startY + event.translationY / (maxHeight - minHeight);
      progress.value = Math.max(0, Math.min(1, newProgress));
    },
    onEnd: (event) => {
      if (Math.abs(event.velocityY) > 500) {
        progress.value = withTiming(event.velocityY > 0 ? 1 : 0);
        runOnJS(setIsMinimized)(event.velocityY > 0);
      } else {
        progress.value = withTiming(progress.value > 0.5 ? 1 : 0);
        runOnJS(setIsMinimized)(progress.value > 0.5);
      }
    },
  });

  const animatedContainerStyle = useAnimatedStyle(() => {
    const height = interpolate(progress.value, [0, 1], [maxHeight, minHeight]);
    const bottom = interpolate(progress.value, [0, 1], [0, minBottom]);
    const backgroundColor = interpolateColor(progress.value, [0, 1], [colorFrom, colorTo]);
    return {
      height,
      bottom,
      backgroundColor,
    };
  });

  const rootContainerHeight = isMinimized ? minHeight + minBottom : maxHeight;

  return (
    <GestureHandlerRootView style={[styles.rootContainer, { height: rootContainerHeight }]}>
      <PanGestureHandler onGestureEvent={handleGesture}>
        <Animated.View style={[styles.container, animatedContainerStyle]}>
          {children}
        </Animated.View>
      </PanGestureHandler>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  rootContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
});