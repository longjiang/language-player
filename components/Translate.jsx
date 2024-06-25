import React, { useState, useEffect } from 'react';
import { Text, View } from 'react-native';
import { translateWithBing } from '@/src/translate'
import { ThemedText } from '@/components/ThemedText';

export const Translate = ({ text, l1Code, l2Code }) => {
  const [translation, setTranslation] = useState('');

  useEffect(() => {
    translate(text);
  }, [text]);

  const translate = async (text) => {
    try {
      const result = await translateWithBing({
        text,
        l1Code, // "To" language code passed in as a prop
        l2Code, // "From" language code passed in as a prop
      });
      setTranslation(result);
    } catch (error) {
      console.error('Translation failed:', error);
      setTranslation('Translation error');
    }
  };

  return (
    translation && <ThemedText>{translation}</ThemedText>
  );
};
