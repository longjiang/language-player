// @/components/DictionaryComponent.tsx
import React, { useState, useEffect } from 'react';
import { View, ScrollView } from 'react-native';
import { Dictionary } from '@/src/dictionary';
import { ThemedInput } from './ThemedInput';
import { ThemedText } from './ThemedText';
import { useDictionary } from '@/contexts/DictionaryContext';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { router } from 'expo-router';

export const DictionaryComponent = () => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const { dictionary } = useDictionary();


    useEffect(() => {
        const checkIfLoaded = setInterval(() => {
            if (dictionary && dictionary.entries.length > 0) {
                clearInterval(checkIfLoaded);
                console.log("Dictionary is ready to use.");
            }
        }, 1000);

        return () => clearInterval(checkIfLoaded);
    }, [dictionary]);

    const handleSearch = (text: string) => {
        // console.log("Dictionary Component: Searching for", text);
        setQuery(text);
        if (dictionary && dictionary.entries) {
            const searchResults = dictionary.search(text);
            setResults(searchResults);
        }
    };

    return (
        <View>
            <ThemedInput
              placeholder="Chinese, pinyin or English..."
              value={query}
              onChangeText={handleSearch}
              style={{ width: '100%' }}
            />
            <ScrollView>
                {results.map((entry, index) => (
                    <View key={index} style={{marginTop: 16}}>
                        <TouchableOpacity onPress={() => router.navigate(`/dictionary/word/${entry.id}`)}>
                          <ThemedText>
                              <ThemedText type="subtitle">{entry.simplified}</ThemedText>
                              <ThemedText type="defaultBold"> ({entry.pinyin})</ThemedText>
                              <ThemedText type="default"> - {entry.definitions}</ThemedText>
                          </ThemedText>
                        </TouchableOpacity>
                    </View>
                ))}
            </ScrollView>
        </View>
    );
};
