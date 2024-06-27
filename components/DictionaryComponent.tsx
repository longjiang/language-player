// @/components/DictionaryComponent.tsx
import React, { useState, useEffect } from 'react';
import { View, ScrollView } from 'react-native';
import { ThemedInput } from './ThemedInput';
import { ThemedText } from './ThemedText';
import { useDictionary } from '@/contexts/DictionaryContext';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { router } from 'expo-router';
import { DictionaryEntry } from '@/src/dictionary';
import { debounce } from 'lodash';

export const DictionaryComponent = () => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<DictionaryEntry[]>([]);
    const { dictionary } = useDictionary();

    const handleSearch = async (text: string) => {
        console.log("dc - Searching for", text);
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
                              <ThemedText type="title" level={entry.level}>{entry.head}</ThemedText>
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
