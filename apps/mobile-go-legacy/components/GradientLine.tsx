// @/components/GradientLine.tsx

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from "expo-linear-gradient";

export const GradientLine = () => {
  return (
    <View>
      <LinearGradient
        colors={['#00B2FF', '#6C7CDE', '#DB0DC6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradientLine}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  gradientLine: {
    height: 3,
    width: '100%',
  },
});