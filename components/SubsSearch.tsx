// @/components/SubsSearch.tsx

import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { VideoWithTranscriptProvider } from '@/contexts/VideoWithTranscriptContext';
import { SubsSearchResults } from './SubsSearchResults';
import { parseSubtitles } from '@/src/subs';
import { useLanguage } from '@/contexts/LanguageContext';
import { subsSearch } from '@/src/api/python/video';

export const SubsSearch = ({ term }: { term: string }): JSX.Element => {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const { l2Lang, t } = useLanguage();
  
  if (!l2Lang) return <Text>{t('loading')}</Text>;

  useEffect(() => {
    if (term) {
      fetchResults(term);
    }
  }, [term]);

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

  return (
    <View>
      {loading ? (
        <ActivityIndicator size="large" color="#0000ff" />
      ) : (
        <VideoWithTranscriptProvider initialVideo={results[0]} initialPlaylist={results}>
          <SubsSearchResults term={term} />
        </VideoWithTranscriptProvider>
      )}
    </View>
  );
};

const handleSubtitlePress = (time: number) => {
  // You'll need to integrate with your video player to seek to this time
  console.log('Seek video to:', time);
};