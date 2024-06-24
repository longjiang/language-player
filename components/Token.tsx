import React from 'react';
import { View, Text } from 'react-native';
import { ThemedText } from './ThemedText'; // Assuming this is already defined
import { useThemeColor } from '@/hooks/useThemeColor';
import { Typography } from '@/constants/Typography';

export const Token = ({ token, textScale = 1, textWeight = 'regular' }) => {
  const defaultFontSize = 16;
  const primaryTextColor = useThemeColor({}, 'primaryText');
  const fontFamily = textWeight === 'bold' ? Typography.fontFamilyBold : Typography.fontFamilyRegular;

  // Render pronunciation only if it is different from the word
  const renderPronunciation = token.pronunciation !== token.word;

  return (
    <View style={{ alignItems: 'center', justifyContent: 'flex-end', padding: 5 }}>
      {renderPronunciation && (
        <Text style={{
          fontFamily,
          color: primaryTextColor,
          fontSize: defaultFontSize * textScale * 0.618,
          lineHeight: defaultFontSize * textScale * 0.618 * 1.14
        }}>
          {token.pronunciation}
        </Text>
      )}
      <Text style={{
        fontFamily,
        color: primaryTextColor,
        fontSize: defaultFontSize * textScale,
        lineHeight: defaultFontSize * textScale * 1.14
      }}>
        {token.word}
      </Text>
    </View>
  );
};

export default Token;
