import React from 'react';
import { View, ScrollView } from 'react-native';
import { VoicePicker } from '@/components/VoicePicker';

export function SpeechSettings() {
  return (
    <ScrollView className="flex-1 bg-background">
      <View className="px-4 pt-6 pb-8">
        <VoicePicker />
      </View>
    </ScrollView>
  );
}

export default SpeechSettings;
