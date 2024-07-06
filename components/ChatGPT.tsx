// @/components/ChatGPT

import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { chatGPT } from '@/src/api/python/openai';
import { ThemedMarkdown } from "@/components/ThemedMarkdown";
import { useThemeColor } from "@/hooks/useThemeColor";

export const ChatGPT = ({ prompt }) => {
  const [loading, setLoading] = useState(true);
  const [markdown, setMarkdown] = useState('');
  const primaryTextColor = useThemeColor({}, "primaryText");

  useEffect(() => {
    const fetchChatGPTResponse = async () => {
      try {
        const response = await chatGPT(prompt);
        setMarkdown(response.data.response);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching data from ChatGPT API:", error);
        setMarkdown('An error occurred while fetching data.');
        setLoading(false);
      }
    };

    fetchChatGPTResponse();
  }, [prompt]);

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={primaryTextColor} />
      </View>
    );
  }

  return (
    <View>
      <ThemedMarkdown>{markdown}</ThemedMarkdown>
    </View>
  );
};


const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
  },
});