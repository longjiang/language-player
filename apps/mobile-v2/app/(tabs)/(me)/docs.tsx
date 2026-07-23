import React from 'react';
import { View, Text, ScrollView, Pressable, Linking } from 'react-native';
import { useT } from '@/hooks/use-t';
import { BookOpen, MessageCircle, HelpCircle } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';

export default function DocsScreen() {
  const t = useT();

  const items = [
    { icon: BookOpen, label: 'Dictionary', desc: 'How to look up words, save vocabulary, and use the popup dictionary.' },
    { icon: BookOpen, label: 'Saved Words & Review', desc: 'Build your vocabulary list and review with flashcards.' },
    { icon: BookOpen, label: 'Watch Videos', desc: 'Learn from authentic videos with interactive dual subtitles.' },
    { icon: BookOpen, label: 'Reader', desc: 'Import text and read with interactive word lookups.' },
    { icon: BookOpen, label: 'Pro Features', desc: 'Unlock complete transcripts, hundreds of examples, and AI explanations.' },
  ];

  return (
    <ScrollView className="flex-1 bg-background px-4 py-5">
      <Text className="text-2xl font-bold text-foreground">{t('title.docs')}</Text>
      <Text className="mt-2 text-sm text-muted-foreground">
        Learn how to use Language Player to its full potential.
      </Text>

      <View className="mt-6 gap-3">
        {items.map((item, i) => (
          <View key={i} className="rounded-lg border border-border bg-card p-4">
            <View className="flex-row items-center gap-2">
              <item.icon size={18} color={ICON_MUTED} />
              <Text className="text-base font-semibold text-foreground">{item.label}</Text>
            </View>
            <Text className="mt-1 text-sm text-muted-foreground">{item.desc}</Text>
          </View>
        ))}
      </View>

      <View className="mt-6 items-center">
        <Pressable onPress={() => Linking.openURL('mailto:jon.long@zerotohero.ca')} className="flex-row items-center gap-2">
          <MessageCircle size={16} color={ICON_MUTED} />
          <Text className="text-sm text-primary">Contact Support</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
