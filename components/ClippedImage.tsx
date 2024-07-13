import React from 'react';
import { View, Image, ImageSourcePropType, StyleProp, ViewStyle, ImageStyle } from 'react-native';

interface ClippedImageProps {
  width: number;
  height: number;
  source: ImageSourcePropType;
  aspectRatio: number; // Aspect ratio of the image as a prop
  verticalAlign?: 'top' | 'center' | 'bottom';
  horizontalAlign?: 'left' | 'center' | 'right';
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center';
}

const ClippedImage: React.FC<ClippedImageProps> = ({
  width,
  height,
  source,
  aspectRatio,
  verticalAlign = 'center',
  horizontalAlign = 'center',
  resizeMode = 'cover' // default to 'cover' if not specified
}) => {
  let imageWidth: number = width; // Default to container width
  let imageHeight: number = height; // Default to container height

  switch (resizeMode) {
    case 'cover':
      if (aspectRatio > (width / height)) {
        imageHeight = height;
        imageWidth = height * aspectRatio;
      } else {
        imageWidth = width;
        imageHeight = width / aspectRatio;
      }
      break;
    case 'contain':
      if (aspectRatio > (width / height)) {
        imageWidth = width;
        imageHeight = width / aspectRatio;
      } else {
        imageHeight = height;
        imageWidth = height * aspectRatio;
      }
      break;
    case 'stretch':
      imageWidth = width;
      imageHeight = height;
      break;
    case 'repeat':
      // Not natively supported in React Native for the Image component
      // Would potentially require a custom implementation or external library
      break;
    case 'center':
      imageWidth = width / aspectRatio;
      imageHeight = height;
      break;
    default:
      imageWidth = width; // Fallback to stretch
      imageHeight = height;
  }

  const style: StyleProp<ViewStyle> = {
    width,
    height,
    backgroundColor: 'green',
    overflow: 'hidden',
    justifyContent: justifyContentMap[verticalAlign],
    alignItems: alignItemsMap[horizontalAlign]
  };

  const imageStyle: StyleProp<ImageStyle> = {
    width: imageWidth,
    height: imageHeight,
    resizeMode: resizeMode !== 'repeat' ? resizeMode : 'cover' // 'repeat' is not supported natively
  };

  return (
    <View style={style}>
      <Image
        source={source}
        style={imageStyle}
      />
    </View>
  );
};

// Alignment maps
const justifyContentMap: Record<string, ViewStyle['justifyContent']> = {
  top: 'flex-start',
  center: 'center',
  bottom: 'flex-end'
};

const alignItemsMap: Record<string, ViewStyle['alignItems']> = {
  left: 'flex-start',
  center: 'center',
  right: 'flex-end'
};

export default ClippedImage;
