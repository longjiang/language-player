import React, { useEffect } from 'react';
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
  const [translatedDefinitions, setTranslatedDefinitions] = React.useState<string[]>([]);
  const { dictionary } = useDictionary();
  const { l1Lang } = useLanguage();

  const translateDefinitions = async () => {
    try {
      if (dictionary && l1Lang) {
        const translated = await translateTextArray(definitions, l1Lang.code, dictionary.l1Code);
        console.log('Translated definitions:', translated);
        setTranslatedDefinitions(translated);
      }
    } catch (error) {
      console.error('Translation failed:', error);
      // Fallback to original definitions if translation fails
      setTranslatedDefinitions(definitions);
    }
  };

  useEffect(() => {
    if (!definitions || definitions.length === 0) {
      return;
    }

    setTranslatedDefinitions(definitions);

    // If dictionary.l1Lang is different from l1Lang set in the app, translate the definitions
    if (dictionary && l1Lang && dictionary.l1Code !== l1Lang.code) {
      translateDefinitions();
    }
  }, [definitions, dictionary, l1Lang]);

  if (!translatedDefinitions || translatedDefinitions.length === 0) {
    return null;
  }

  return (
    <View>
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