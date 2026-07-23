import React from 'react';
import { View, Text, ScrollView, Pressable, Linking } from 'react-native';
import { useT } from '@/hooks/use-t';

export default function AboutScreen() {
  const t = useT();

  return (
    <ScrollView className="flex-1 bg-background px-4 py-5">
      <Text className="text-2xl font-bold text-foreground">{t('title.about')}</Text>
      <Text className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Language Player helps you learn 60+ languages through authentic video content
        with interactive dual subtitles, built-in dictionary, and smart difficulty tracking.
      </Text>
      <Text className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Access 600,000+ videos across 207+ languages. See collocations, example sentences,
        verb inflections, and Chinese character decomposition in the dictionary.
      </Text>
      <Pressable onPress={() => Linking.openURL('mailto:jon.long@zerotohero.ca')} className="mt-6">
        <Text className="text-sm text-primary">Contact: jon.long@zerotohero.ca</Text>
      </Pressable>
    </ScrollView>
  );
}
