import React, { useState } from 'react';
import { Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
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

const ToggleableBackground = () => {
  const [isMinimized, setIsMinimized] = useState(false);
  const progress = useSharedValue(0);
  const screenHeight = Dimensions.get('window').height;

  const toggleMinimize = () => {
    setIsMinimized(!isMinimized);
    progress.value = withTiming(isMinimized ? 0 : 1, { duration: 300 });
  };

  const gestureHandler = useAnimatedGestureHandler({
    onStart: (_, context) => {
      context.startY = progress.value;
    },
    onActive: (event, context) => {
      const newProgress = context.startY + event.translationY / screenHeight;
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
    const height = interpolate(
      progress.value,
      [0, 1],
      [screenHeight, 70] // Set the minimized height to 70px
    );
    const bottom = interpolate(
      progress.value,
      [0, 1],
      [0, 100] // Set the bottom distance to 100px when minimized
    );
    const backgroundColor = interpolateColor(
      progress.value,
      [0, 1],
      ['purple', 'green']
    );
    return {
      height,
      bottom,
      borderTopLeftRadius: 0, // No border radius when minimized
      borderTopRightRadius: 0, // No border radius when minimized
      backgroundColor,
    };
  });

  return (
    <GestureHandlerRootView style={styles.rootContainer}>
      <PanGestureHandler onGestureEvent={gestureHandler}>
        <Animated.View style={[styles.container, animatedContainerStyle]}>
          <TouchableOpacity style={styles.button} onPress={toggleMinimize}>
            <Text style={styles.buttonText}>
              {isMinimized ? 'Maximize' : 'Minimize'}
            </Text>
          </TouchableOpacity>
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    borderColor: 'white',
    borderWidth: 1,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default ToggleableBackground;