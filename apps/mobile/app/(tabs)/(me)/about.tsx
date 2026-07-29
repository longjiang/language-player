import React from 'react';
import { View, Text, ScrollView, Image, Pressable } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Package, Calendar, Globe, Wrench } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';
import { useT } from '@/hooks/use-t';

/** Safe require for the logo asset. */
const logoSource = (() => {
  try { return require('@/assets/logo.png'); } catch { return null; }
})();

/** Return a 0-padded two-digit string. */
function pad(n: number): string { return n < 10 ? `0${n}` : `${n}`; }

/** Format an ISO-8601 date string for display. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface InfoRowProps {
  icon: React.ComponentType<{ color: string; size: number }>;
  label: string;
  value: string;
}

function InfoRow({ icon: Icon, label, value }: InfoRowProps) {
  return (
    <View className="flex-row items-center justify-between border-b border-border py-2.5">
      <View className="flex-row items-center gap-2.5">
        <Icon color={ICON_MUTED} size={16} />
        <Text className="text-sm text-muted-foreground">{label}</Text>
      </View>
      <Text className="text-sm font-medium text-foreground">{value}</Text>
    </View>
  );
}

export default function AboutScreen() {
  const t = useT();
  const router = useRouter();
  const version = Constants.expoConfig?.version ?? '0.0.0';
  const environment = __DEV__ ? 'development' : 'production';
  const buildDate = new Date().toISOString();

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="min-h-screen flex-col items-center px-4 py-12">
        <View className="w-full" style={{ maxWidth: 512 }}>
          {/* Header */}
          <View className="mb-8 items-center">
            {logoSource && (
              <Image
                source={logoSource}
                className="mb-4 h-16 w-16 rounded-xl"
                resizeMode="contain"
              />
            )}
            <Text className="text-2xl font-bold text-foreground">{t('title.app_name')}</Text>
            <Text className="mt-1 text-sm text-muted-foreground">{t('title.about')}</Text>
          </View>

          {/* Build Info Card */}
          <View className="rounded-xl border border-border bg-card p-5">
            <InfoRow icon={Package} label={t('label.version')} value={`v${version}`} />
            <InfoRow icon={Calendar} label={t('label.build_date')} value={formatDate(buildDate)} />
            <InfoRow icon={Globe} label={t('label.environment')} value={environment} />
          </View>

          {/* Dev tools link */}
          {__DEV__ && (
            <Pressable
              onPress={() => router.push('/(tabs)/(me)/tokenizer-test' as any)}
              className="mt-3 rounded-xl border border-border bg-card px-5 py-3.5 active:bg-muted"
            >
              <View className="flex-row items-center gap-2.5">
                <Wrench size={16} color={ICON_MUTED} />
                <Text className="text-sm text-foreground">{t('title.tokenizer_test')}</Text>
              </View>
            </Pressable>
          )}

          {/* Footer */}
          <View className="mt-6 items-center">
            <Text className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} Language Player
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
