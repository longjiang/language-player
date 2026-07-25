import React, { useState, useEffect } from 'react';
import { Text, View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { useDictionary } from '@/contexts/DictionaryContext';

export const Translate = ({ text, l1Code, l2Code }) => {
  const [translation, setTranslation] = useState('');
  const { translationManager } = useDictionary();

  useEffect(() => {
    translate(text);
  }, [text, translationManager]);

  const translate = async (text) => {
    try {
      const result = await translationManager.translate(text, l1Code, l2Code);
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