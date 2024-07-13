// @/app/index.tsx

import React from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import ClippedImage from '@/components/ClippedImage';  // Ensure this path is correct based on your project structure

const IndexScreen = () => {
  return (
    <SafeAreaView style={styles.container}>
      <ClippedImage
        source={require("../assets/images/splash-image.png")}
        width={200}
        height={200}
        verticalAlign='bottom'
        horizontalAlign='center'
        resizeMode='cover'
        aspectRatio={0.7264}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff', // Optional: Set a background color
  },
});

export default IndexScreen;
