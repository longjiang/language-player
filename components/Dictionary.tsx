import React, { useState, useEffect } from 'react';
import { View, TextInput, Text, ScrollView } from 'react-native';
import { Dictionary } from '@/src/dictionary';
import axios from 'axios';
import Papa from 'papaparse';
import { ThemedInput } from './ThemedInput';
import { ThemedText } from './ThemedText';

const DictionaryComponent = () => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [dictionary, setDictionary] = useState<Dictionary | null>(null);

    useEffect(() => {
        const fetchDictionaryData = async () => {
            try {
                const response = await axios.get('https://server.chinesezerotohero.com/data/hsk-cedict/hsk_cedict.csv.txt');
                const parsedData = Papa.parse(response.data, { header: true });
                const entries = parsedData.data;
                const newDictionary = new Dictionary(entries);
                console.log('Dictionary loaded.');
                setDictionary(newDictionary);
            } catch (error) {
                console.error('Failed to fetch dictionary data:', error);
            }
        };

        fetchDictionaryData();
    }, []);

    const handleSearch = (text: string) => {
        setQuery(text);
        if (dictionary) {
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
                        <ThemedText><ThemedText type="title">{entry.simplified}</ThemedText>
                        <ThemedText type="defaultBold"> ({entry.pinyin})</ThemedText>
                        <ThemedText type="default"> - {entry.definitions}</ThemedText></ThemedText>
                    </View>
                ))}
            </ScrollView>
        </View>
    );
};

export default DictionaryComponent;
