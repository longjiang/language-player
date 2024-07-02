import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import axios from 'axios';  // You need to install axios for HTTP requests
import { VideoWithTranscriptProvider } from '@/contexts/VideoWithTranscriptContext';
import { SubsSearchResults } from './SubsSearchResults';
import { parseSubtitles } from '@/src/subs';
import { PYTHON_SERVER } from '@/src/api/python'
import { useLanguage } from '@/contexts/LanguageContext';

export const SubsSearch = ({ term }: { term: string }): JSX.Element => {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const { l2Lang } = useLanguage()
  if (!l2Lang) return <Text>Loading...</Text>

  useEffect(() => {
    if (term) {
      fetchResults(term);
    }
  }, [term]);

  const fetchResults = async (searchTerm: string): Promise<void> => {
    setLoading(true);
    try {
      const response = await axios.get(`${PYTHON_SERVER}/subs-search?l2=${l2Lang.code}&terms=${searchTerm}&limit=50&tv_show=nnull&sort=-views`);
      const data = response.data;
      data.forEach((item: any) => {
        item.subs_l1 = parseSubtitles(item.subs_l2);
        item.subs_l2 = parseSubtitles(item.subs_l2);
      });
      setResults(data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch Results:', error);
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

const handleSubtitlePress = (time) => {
  // You'll need to integrate with your video player to seek to this time
  console.log('Seek video to:', time);
};