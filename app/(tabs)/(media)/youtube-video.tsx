import React from 'react';
import { View, Text, SafeAreaView } from 'react-native';
import { ThemedButton } from '@/components/ThemedButton';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { router, Link } from 'expo-router';

const YouTubeVideoScreen = () => {
  return (
    <SafeAreaView style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <View>
        <ThemedButton
          type="ghost"
          trailingIcon={<Icon name="chevron-down" />}
          onPress={() => router.push("../")}
        />
      </View>
      <View style={{ flexDirection: 'row' }}>

        <ThemedButton
          type="ghost"
          trailingIcon={<Icon name="text-long" />}
          onPress={() => router.push("/(tabs)/(media)/youtube-video")}
        />
        <ThemedButton
          type="ghost"
          trailingIcon={<Icon name="cog-outline" />}
          onPress={() => router.push("/(tabs)/(media)/youtube-video")}
        />
      </View>
    </SafeAreaView>
  );
};

export default YouTubeVideoScreen;