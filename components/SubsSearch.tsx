import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import axios from 'axios';  // You need to install axios for HTTP requests
import { YouTubeVideo } from './YouTubeVideo';
import { VideoWithTranscript } from './VideoWithTranscript';
import { VideoWithTranscriptProvider } from '@/contexts/VideoWithTranscriptContext';
import { ThemedText } from './ThemedText';
import { SubsSearchResults } from './SubsSearchResults';
import { SubsSearchResultsList } from "@/components/SubsSearchResultsList";
import { parse } from '@babel/core';
import { parseSubtitles } from '@/src/subs';
import RBSheet from 'react-native-raw-bottom-sheet';
import { useThemeColor } from "@/hooks/useThemeColor";
import { PYTHON_SERVER } from '@/src/api/python'

export const SubsSearch = ({ term }: { term: string }): JSX.Element => {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (term) {
      fetchResults(term);
    }
  }, [term]);

  const fetchResults = async (searchTerm: string): Promise<void> => {
    setLoading(true);
    try {
      const response = await axios.get(`${PYTHON_SERVER}/subs-search?l2=zh&terms=${searchTerm}&limit=50&tv_show=nnull&sort=-views`);
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
    <View style={styles.container}>
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

const styles = StyleSheet.create({
  container: {
  },
});
