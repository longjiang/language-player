import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View } from 'react-native';
import { ThemedText } from './ThemedText';
import { useDictionary } from '@/contexts/DictionaryContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { translateTextArray } from '@/src/api/python/translate';

interface DefinitionListProps {
  definitions: string[];
  type?: 'default' | 'defaultBold' | 'link' | 'linkBold' | 'large' | 'subtitle' | 'xlarge' | 'title' | 'xxlarge';
}

const DefinitionList: React.FC<DefinitionListProps> = ({ definitions, type = "default" }) => {
  const [translatedDefinitions, setTranslatedDefinitions] = useState<string[]>([]);
  const { dictionary } = useDictionary();
  const { l1Lang } = useLanguage();
  const viewRef = useRef<View>(null);
  const [isWithinViewport, setIsWithinViewport] = useState(false);
  const [hasTranslated, setHasTranslated] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const translateDefinitions = async () => {
    if (hasTranslated) return; // Prevent multiple translations
    try {
      if (dictionary && l1Lang && dictionary.l1Code !== l1Lang.code) {
        const translated = await translateTextArray(definitions, l1Lang.code, dictionary.l1Code);
        console.log('Translated definitions:', translated);
        setTranslatedDefinitions(translated);
        setHasTranslated(true);
      }
    } catch (error) {
      console.error('Translation failed:', error);
      // Fallback to original definitions if translation fails
      setTranslatedDefinitions(definitions);
    }
  };

  const debouncedCheckPosition = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      viewRef.current?.measure((x, y, width, height, pageX, pageY) => {
        const isNowWithinViewport = pageY >= 0 && pageY < 1600;
        setIsWithinViewport(isNowWithinViewport);
        if (isNowWithinViewport && !hasTranslated) {
          translateDefinitions();
        }
      });
    }, 500); // 500ms debounce time
  }, [hasTranslated]);

  useEffect(() => {
    if (!definitions || definitions.length === 0) {
      return;
    }

    setTranslatedDefinitions(definitions);
    
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
    if (isWithinViewport && !hasTranslated) {
      translateDefinitions();
    }
  }, [isWithinViewport, dictionary, l1Lang]);

  if (!translatedDefinitions || translatedDefinitions.length === 0) {
    return null;
  }

  return (
    <View ref={viewRef} onLayout={debouncedCheckPosition}>
      <ThemedText type={type} style={{ marginBottom: 8 }}>
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