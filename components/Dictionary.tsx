import React, { useState, useEffect } from 'react';
import { View, TextInput, Text, ScrollView } from 'react-native';
import { Dictionary } from '@/src/dictionary';
import axios from 'axios';
import Papa from 'papaparse';

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
            <TextInput
                placeholder="Search here..."
                value={query}
                onChangeText={handleSearch}
                style={{ height: 40, borderColor: 'gray', borderWidth: 1, padding: 10 }}
            />
            <ScrollView>
                {results.map((entry, index) => (
                    <Text key={index}>
                        {entry.simplified} ({entry.pinyin}) - {entry.definitions}
                    </Text>
                ))}
            </ScrollView>
        </View>
    );
};

export default DictionaryComponent;
