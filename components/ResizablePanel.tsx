import React, { useState } from 'react';
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

/**
 * A component that allows vertical resizing and color transitioning via a pan gesture.
 * @param {object} props - Component props.
 * @param {React.ReactNode} props.children - Children nodes to be rendered inside the component.
 * @param {number} props.minHeight - The minimum height of the container.
 * @param {number} props.maxHeight - The maximum height of the container.
 * @param {number} props.minBottom - The minimum bottom spacing of the container.
 * @param {string} props.colorFrom - Initial color of the container background.
 * @param {string} props.colorTo - Final color of the container background.
 */
const ResizablePanel = ({
  children,
  minHeight = 70,
  maxHeight = Dimensions.get('window').height,
  minBottom = 100,
  colorFrom = 'purple',
  colorTo = 'green'
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const progress = useSharedValue(0);

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
    return { height, bottom, backgroundColor };
  });

  return (
    <GestureHandlerRootView style={styles.rootContainer}>
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
    top: 0,
  },
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    padding: 20,
  },
});

export default ResizablePanel;
