import React from 'react';
import { View, StyleSheet } from 'react-native';

export const ResizablePanel = ({
  children,
  visible = false,
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
  if (!visible) {
    return null;
  }

  return (
    <View style={styles.container}>
      {children}
    </View>
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
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
});
