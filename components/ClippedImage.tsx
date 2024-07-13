import React from 'react';
import { View, Image, ImageSourcePropType, StyleProp, ViewStyle, ImageStyle } from 'react-native';

interface ClippedImageProps {
  width: number;
  height: number;
  source: ImageSourcePropType;
  aspectRatio: number;
  verticalAlign?: 'top' | 'center' | 'bottom';
  horizontalAlign?: 'left' | 'center' | 'right';
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center';
  style?: StyleProp<ViewStyle>; // New style prop
}

export const ClippedImage: React.FC<ClippedImageProps> = ({
  width,
  height,
  source,
  aspectRatio,
  verticalAlign = 'center',
  horizontalAlign = 'center',
  resizeMode = 'cover',
  style // New style prop
}) => {
  let imageWidth: number = width;
  let imageHeight: number = height;

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
      break;
    case 'center':
      imageWidth = width / aspectRatio;
      imageHeight = height;
      break;
    default:
      imageWidth = width;
      imageHeight = height;
  }

  const containerStyle: StyleProp<ViewStyle> = [
    {
      width,
      height,
      overflow: 'hidden',
      justifyContent: justifyContentMap[verticalAlign],
      alignItems: alignItemsMap[horizontalAlign]
    },
    style // Merge the external style
  ];

  const imageStyle: StyleProp<ImageStyle> = {
    width: imageWidth,
    height: imageHeight,
    resizeMode: resizeMode !== 'repeat' ? resizeMode : 'cover'
  };

  return (
    <View style={containerStyle}>
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