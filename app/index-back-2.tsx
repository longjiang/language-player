// @/app/index.tsx

import React from 'react';
import { SafeAreaView, StyleSheet, Text } from 'react-native';
import ImageFrame from './ImageFrame';

const App = () => {
  return (
    <SafeAreaView style={styles.container}>
      <ImageFrame
        source={require("../assets/images/splash-image.png")}
        width={300}
        height={400}
        resizeMode="cover" // "cover" to fill the frame
        align="bottom" // Align to the bottom of the frame
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

export default App;
