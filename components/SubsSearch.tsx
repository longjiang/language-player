import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import axios from 'axios';  // You need to install axios for HTTP requests
import { YouTubeVideo } from './YouTubeVideo';
import { VideoWithTranscript } from './VideoWithTranscript';
import { VideoWithTranscriptProvider } from '@/contexts/VideoWithTranscriptContext';
import { ThemedText } from './ThemedText';
import { SubsSearchResults } from './SubsSearchResults';

export const SubsSearch = ({ term }) => {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (term) {
      fetchResults(term);
    }
  }, [term]);

  const fetchResults = async (searchTerm) => {
    setLoading(true);
    try {
      const response = await axios.get(`https://python.zerotohero.ca/subs-search?l2=zh&terms=${searchTerm}&limit=50&sort=-views`);
      setResults(response.data);
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
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center'
  },
  ResultsContainer: {
    flex: 1,
    paddingHorizontal: 10,
  },
  subtitleText: {
    fontSize: 16,
    color: '#000',
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    marginBottom: 5
  }
});
