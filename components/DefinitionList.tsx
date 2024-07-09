// @/components/DefinitionList

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, ViewStyle } from 'react-native';
import { ThemedText } from './ThemedText';
import { useDictionary } from '@/contexts/DictionaryContext';
import { useLanguage } from '@/contexts/LanguageContext';

interface DefinitionListProps {
  definitions: string[];
  type?: 'default' | 'defaultBold' | 'link' | 'linkBold' | 'large' | 'subtitle' | 'xlarge' | 'title' | 'xxlarge';
  style?: ViewStyle;
}

export const DefinitionList: React.FC<DefinitionListProps> = ({ definitions, type = "default", style }) => {
  const [translatedDefinitions, setTranslatedDefinitions] = useState<string[]>(definitions);
  const { dictionary, translationManager } = useDictionary();
  const { l1Lang, l2Lang } = useLanguage();
  const viewRef = useRef<View>(null);
  const [isWithinViewport, setIsWithinViewport] = useState(false);
  const hasTranslatedRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const translateDefinitions = useCallback(async () => {
    if (hasTranslatedRef.current) return; // Prevent multiple translations
    const l1Code = l1Lang?.code;
    try {
      if (dictionary && l1Lang && dictionary.l1Code !== l1Code && l1Code !== l2Lang.code) {
        const translated = await translationManager.translateArray(definitions, l1Lang.code, dictionary.l1Code);
        // console.log('Translated definitions:', translated);
        setTranslatedDefinitions(translated);
        hasTranslatedRef.current = true;
      }
    } catch (error) {
      console.error('Translation failed:', error);
      // Fallback to original definitions if translation fails
      setTranslatedDefinitions(definitions);
    }
  }, [definitions, dictionary, l1Lang, translationManager]);

  const debouncedCheckPosition = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      viewRef.current?.measure((x, y, width, height, pageX, pageY) => {
        const isNowWithinViewport = pageY >= 0 && pageY < 1600;
        setIsWithinViewport(isNowWithinViewport);
        if (isNowWithinViewport && !hasTranslatedRef.current) {
          translateDefinitions();
        }
      });
    }, 500); // 500ms debounce time
  }, [translateDefinitions]);

  useEffect(() => {
    setTranslatedDefinitions(definitions);
    hasTranslatedRef.current = false;
    
    if (!definitions || definitions.length === 0) {
      return;
    }

    // Initial position check
    debouncedCheckPosition();

    // Set up interval to periodically check position
    const intervalId = setInterval(debouncedCheckPosition, 1000); // Check every second

    // Clean up interval and debounce timer on component unmount
    return () => {
      clearInterval(intervalId);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [definitions, debouncedCheckPosition]);

  useEffect(() => {
    if (isWithinViewport && !hasTranslatedRef.current) {
      translateDefinitions();
    }
  }, [isWithinViewport, translateDefinitions]);

  if (!translatedDefinitions || translatedDefinitions.length === 0) {
    return null;
  }

  return (
    <View ref={viewRef} onLayout={debouncedCheckPosition} style={style}>
      <ThemedText type={type}>
        {translatedDefinitions.map((definition, index) => (
          <React.Fragment key={index}>
            {index > 0 && '; '}
            {definition}
          </React.Fragment>
        ))}
      </ThemedText>
    </View>
  );
};

export default DefinitionList;