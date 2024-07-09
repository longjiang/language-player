// @/components/SubsSearch.tsx

import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { VideoWithTranscriptProvider } from '@/contexts/VideoWithTranscriptContext';
import { SubsSearchResults } from './SubsSearchResults';
import { useLanguage } from '@/contexts/LanguageContext';
import { subsSearch } from '@/src/api/python/video';

export const SubsSearch = ({ term }: { term: string }): JSX.Element => {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const { l2Lang, t } = useLanguage();
  
  useEffect(() => {
    if (l2Lang && term) {
      fetchResults(term);
    }
  }, [term, l2Lang]);

  const fetchResults = async (searchTerm: string): Promise<void> => {
    setLoading(true);
    try {
      const videos = await subsSearch(
        [searchTerm],
        l2Lang.code,
        undefined,
        undefined,
        50,
        5,
        '-views'
      );
      
      setResults(videos);
    } catch (error) {
      console.error('Failed to fetch Results:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!l2Lang) return <Text>{t('loading')}</Text>;

  if (loading) {
    return <ActivityIndicator size="large" color="#0000ff" />;
  }

  return (
    <View>
      {results.length > 0 ? (
        <VideoWithTranscriptProvider initialVideo={results[0]} initialPlaylist={results}>
          <SubsSearchResults term={term} />
        </VideoWithTranscriptProvider>
      ) : (
        <Text>{t('no_results')}</Text>
      )}
    </View>
  );
};