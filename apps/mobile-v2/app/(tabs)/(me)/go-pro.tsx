import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useT } from '@/hooks/use-t';
import { Crown, Check } from 'lucide-react-native';
import { ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';

const PLANS = [
  { nameKey: 'plan.monthly' as const, price: 'US$10', period: '/mo' },
  { nameKey: 'plan.annual' as const, price: 'US$90', period: '/yr' },
  { nameKey: 'plan.lifetime' as const, price: 'US$169', period: 'one-time' },
];

const FEATURE_KEYS = [
  'pro.feature_transcripts',
  'pro.feature_examples',
  'pro.feature_saved_words',
  'pro.feature_srs',
  'pro.feature_ai',
];

export default function GoProScreen() {
  const t = useT();

  return (
    <ScrollView className="flex-1 bg-background px-4 py-8">
      <View className="items-center">
        <Crown size={48} color={ICON_PRIMARY} />
        <Text className="mt-3 text-2xl font-bold text-foreground">{t('action.go_pro')}</Text>
        <Text className="mt-2 text-center text-sm text-muted-foreground">
          {t('pro.desc')}
        </Text>
      </View>

      {/* Plans */}
      <View className="mt-8 gap-3">
        {PLANS.map((plan, i) => (
          <View key={i} className={`rounded-xl border p-4 ${i === 1 ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}>
            {i === 1 && (
              <View className="mb-2 self-start rounded-full bg-primary px-2 py-0.5">
                <Text className="text-xs font-bold text-primary-foreground">{t('label.popular')}</Text>
              </View>
            )}
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-lg font-bold text-foreground">{t(plan.nameKey)}</Text>
                <Text className="text-sm text-muted-foreground">{plan.period}</Text>
              </View>
              <Text className="text-xl font-bold text-foreground">{plan.price}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Features */}
      <View className="mt-8 rounded-xl border border-border bg-card p-4">
        <Text className="mb-3 text-sm font-semibold text-foreground">{t('pro.features_title')}</Text>
        {FEATURE_KEYS.map((key, i) => (
          <View key={i} className="flex-row items-center gap-2 py-1.5">
            <Check size={16} color={ICON_PRIMARY} />
            <Text className="text-sm text-foreground">{t(key)}</Text>
          </View>
        ))}
      </View>

      <Text className="mt-6 text-center text-xs text-muted-foreground">
        Contact: jon.long@zerotohero.ca
      </Text>
    </ScrollView>
  );
}
