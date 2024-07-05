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
import DefinitionList from './DefinitionList';

export const DictionaryComponent = () => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<DictionaryEntry[]>([]);
    const { dictionary } = useDictionary();
    const { settings } = useSettings();
    const { l2Lang, t } = useLanguage();
    
    if (!l2Lang) return null;

    const headKey = l2Lang.code === 'zh' && settings.useTraditional ? 'alternate' : 'head';
    const alternateKey = l2Lang.code === 'zh' && settings.useTraditional ? 'head' : 'alternate';
    
    const handleSearch = async (text: string) => {
        setQuery(text);
        if (dictionary) setResults((await dictionary.search(text)).slice(0, 50));
    };

    const altFieldKey = {
        'zh': 'pinyin',
        'ja': 'kana',
        'ko': 'hanja',
    }[l2Lang.code];
    
    const dictL1Name = t('lang.' + dictionary?.l1Code);
    const altField = t('word.' + altFieldKey);
    const l2Name = t('lang.' + l2Lang.code);

    return (
        <View>
            <ThemedInput
              placeholder={t('placeholder.dict_search', {
                l2Name: l2Name,
                altField: altField,
                dictL1Name: dictL1Name
              })}
              value={query}
              onChangeText={debounce(handleSearch, 300)}
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
                          </ThemedText>
                          {entry.definitions?.length && <DefinitionList definitions={entry.definitions.slice(0, 2)} type="default" />}
                        </TouchableOpacity>
                    </View>
                ))}
            </ScrollView>
        </View>
    );
};