import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

// Custom Image Frame Component
const ImageFrame = ({ source, width, height, resizeMode, align }) => {
  const alignmentStyles = getAlignmentStyles(align);

  return (
    <View style={[styles.container, { width, height }]}>
      <Image
        source={source}
        style={[styles.image, alignmentStyles, { resizeMode }]}
      />
    </View>
  );
};

// Function to get alignment styles
const getAlignmentStyles = (align) => {
  switch (align) {
    case 'top':
      return { alignSelf: 'flex-start' };
    case 'bottom':
      return { alignSelf: 'flex-end' };
    case 'left':
      return { alignSelf: 'flex-start' };
    case 'right':
      return { alignSelf: 'flex-end' };
    case 'center':
      return { alignSelf: 'center' };
    default:
      return {};
  }
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden', // Ensures the image is clipped to the container
  },
  image: {
    width: '100%',
    height: '100%',
  },
});

export default ImageFrame;
