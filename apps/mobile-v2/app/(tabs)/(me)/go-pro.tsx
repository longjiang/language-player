import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useT } from '@/hooks/use-t';
import { Crown, Check } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';

const PLANS = [
  { name: 'Monthly', price: 'US$10', period: '/mo' },
  { name: 'Annual', price: 'US$90', period: '/yr' },
  { name: 'Lifetime', price: 'US$169', period: 'one-time' },
];

const FEATURES = [
  'Complete interactive transcripts with translation',
  'Hundreds of examples of words in videos',
  'Unlimited saved words',
  'SRS review system',
  'AI word explanations',
];

export default function GoProScreen() {
  const t = useT();

  return (
    <ScrollView className="flex-1 bg-background px-4 py-8">
      <View className="items-center">
        <Crown size={48} color="#f59e0b" />
        <Text className="mt-3 text-2xl font-bold text-foreground">{t('action.go_pro')}</Text>
        <Text className="mt-2 text-center text-sm text-muted-foreground">
          Unlock the full learning experience with 600,000+ videos across 207+ languages.
        </Text>
      </View>

      {/* Plans */}
      <View className="mt-8 gap-3">
        {PLANS.map((plan, i) => (
          <View key={i} className={`rounded-xl border p-4 ${i === 1 ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}>
            {i === 1 && (
              <View className="mb-2 self-start rounded-full bg-primary px-2 py-0.5">
                <Text className="text-xs font-bold text-primary-foreground">POPULAR</Text>
              </View>
            )}
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-lg font-bold text-foreground">{plan.name}</Text>
                <Text className="text-sm text-muted-foreground">{plan.period}</Text>
              </View>
              <Text className="text-xl font-bold text-foreground">{plan.price}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Features */}
      <View className="mt-8 rounded-xl border border-border bg-card p-4">
        <Text className="mb-3 text-sm font-semibold text-foreground">Pro Features</Text>
        {FEATURES.map((f, i) => (
          <View key={i} className="flex-row items-center gap-2 py-1.5">
            <Check size={16} color="#22c55e" />
            <Text className="text-sm text-foreground">{f}</Text>
          </View>
        ))}
      </View>

      <Text className="mt-6 text-center text-xs text-muted-foreground">
        Contact: jon.long@zerotohero.ca
      </Text>
    </ScrollView>
  );
}
