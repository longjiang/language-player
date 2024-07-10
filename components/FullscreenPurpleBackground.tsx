import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  interpolateColor,
} from 'react-native-reanimated';

const ToggleableBackground = () => {
  const [isMinimized, setIsMinimized] = useState(false);
  const progress = useSharedValue(0);

  const screenHeight = Dimensions.get('window').height; // Get the screen height for dynamic sizing

  const toggleMinimize = () => {
    setIsMinimized(!isMinimized);
    progress.value = withTiming(isMinimized ? 0 : 1, { duration: 300 });
  };

  const animatedContainerStyle = useAnimatedStyle(() => {
    const height = interpolate(
      progress.value,
      [0, 1],
      [screenHeight, 70] // Interpolate height from full screen to 70px
    );
    const bottom = interpolate(
      progress.value,
      [0, 1],
      [0, 100] // Interpolate bottom from 0px to 100px
    );
    const backgroundColor = interpolateColor(
      progress.value,
      [0, 1],
      ['purple', 'green']
    );

    return {
      height,
      bottom,
      backgroundColor,
    };
  });

  return (
    <Animated.View style={[styles.container, animatedContainerStyle]}>
      <TouchableOpacity style={styles.button} onPress={toggleMinimize}>
        <Text style={styles.buttonText}>
          {isMinimized ? 'Maximize' : 'Minimize'}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
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
    fontSize: 24,
    fontWeight: 'bold',
  },
});

export default ToggleableBackground;
