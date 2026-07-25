import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Dimensions } from 'react-native';

export const ResizablePanel = ({
  children,
  minHeight = 70,
  maxHeight = Dimensions.get('window').height,
  minBottom = 100,
  colorFrom = 'purple',
  colorTo = 'green',
  visible = false,
  isMinimized,
  setIsMinimized,
}: {
  children: React.ReactNode;
  minHeight?: number;
  maxHeight?: number;
  minBottom?: number;
  colorFrom?: string;
  colorTo?: string;
  visible?: boolean;
  isMinimized?: boolean;
  setIsMinimized?: (v: boolean) => void;
}) => {
  const heightAnim = useRef(new Animated.Value(isMinimized ? minHeight : maxHeight)).current;
  const bottomAnim = useRef(new Animated.Value(isMinimized ? minBottom : 0)).current;
  const bgColor = useRef(new Animated.Value(isMinimized ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heightAnim, {
        toValue: isMinimized ? minHeight : maxHeight,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(bottomAnim, {
        toValue: isMinimized ? minBottom : 0,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(bgColor, {
        toValue: isMinimized ? 1 : 0,
        duration: 300,
        useNativeDriver: false,
      }),
    ]).start();
  }, [isMinimized]);

  const backgroundColor = bgColor.interpolate({
    inputRange: [0, 1],
    outputRange: [colorFrom, colorTo],
  });

  if (!visible) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.rootContainer,
        { height: heightAnim, bottom: bottomAnim },
      ]}
    >
      <Animated.View style={[styles.container, { backgroundColor }]}>
        <Animated.View style={styles.overlay}>
          {children}
        </Animated.View>
      </Animated.View>
    </Animated.View>
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
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
});
