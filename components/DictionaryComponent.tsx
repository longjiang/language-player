// @/components/DictionaryComponent.tsx
import React, { useState, useEffect } from 'react';
import { View, ScrollView } from 'react-native';
import { ThemedInput } from './ThemedInput';
import { ThemedText } from './ThemedText';
import { useDictionary } from '@/contexts/DictionaryContext';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { router } from 'expo-router';
import { DictionaryEntry } from '@/src/dictionary-types';
import { debounce } from 'lodash';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettings } from '@/contexts/SettingsContext';

export const DictionaryComponent = () => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<DictionaryEntry[]>([]);
    const { dictionary } = useDictionary();
    const { settings } = useSettings(); // Use the settings from context
    const { l2Lang } = useLanguage(); // Use the language from context
    if (!l2Lang) return null;

    // if l2Lang.code is 'zh' and settings.useTraditional is true, then switch head and alternate keys
    const headKey = l2Lang.code === 'zh' && settings.useTraditional ? 'alternate' : 'head';
    const alternateKey = l2Lang.code === 'zh' && settings.useTraditional ? 'head' : 'alternate';
    
    const handleSearch = async (text: string) => {
        setQuery(text);
        if (dictionary) setResults((await dictionary.search(text)).slice(0, 50));
    };

    return (
        <View>
            <ThemedInput
              placeholder="Chinese, pinyin or English..."
              value={query}
              onChangeText={ debounce(handleSearch, 300) }
              style={{ width: '100%' }}
            />
            <ScrollView>
                {results.map((entry, index) => (
                    <View key={index} style={{marginTop: 16}}>
                        <TouchableOpacity onPress={() => router.navigate(`/dictionary/word/${entry.id}`)}>
                          <ThemedText>
                              <ThemedText type="title" level={entry.level}>{entry[headKey]}</ThemedText>
                              <ThemedText type="default" variant="secondary"> {entry[alternateKey]}</ThemedText>
                              <ThemedText type="defaultBold"> {entry.pronunciation}</ThemedText>
                              <ThemedText type="default"> • {entry.definitions.join('; ')}</ThemedText>
                          </ThemedText>
                        </TouchableOpacity>
                    </View>
                ))}
            </ScrollView>
        </View>
    );
};
