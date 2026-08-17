import React from 'react';
import { View, Text, ScrollView, Image, Linking } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import * as Dialog from '@/components/ui/dialog';
import { useT } from '@/hooks/use-t';
import { useLanguage } from '@/contexts/LanguageContext';
import { useResponsive } from '@/hooks/use-responsive';
import {
  Package,
  Calendar,
  Globe,
  Mail,
  MessageCircle,
  ChevronRight,
  BookOpen,
  Wrench,
  X,
  GitCommit,
} from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';

const logoSource = (() => {
  try {
    return require('@/assets/logo.png');
  } catch {
    return null;
  }
})();

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

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

interface LinkRowProps {
  icon: React.ComponentType<{ color: string; size: number }>;
  label: string;
  onPress: () => void;
}

function LinkRow({ icon: Icon, label, onPress }: LinkRowProps) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-2.5 border-b border-border py-2.5 active:bg-muted last:border-0"
    >
      <Icon color={ICON_MUTED} size={16} />
      <Text className="text-sm text-foreground">{label}</Text>
      <ChevronRight size={16} color={ICON_MUTED} className="ml-auto" />
    </Pressable>
  );
}

export function AboutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const { l1Lang, l2Lang } = useLanguage();
  const { isSm } = useResponsive();
  const version = Constants.expoConfig?.version ?? '0.0.0';
  const environment = __DEV__ ? 'development' : 'production';
  const buildDate = new Date().toISOString();
  // Debug builds ("dev builds") can embed the exact git commit via
  // EXPO_PUBLIC_GIT_SHA — set it when starting Metro (Metro inlines
  // EXPO_PUBLIC_* at serve time), e.g.:
  //   EXPO_PUBLIC_GIT_SHA=$(git rev-parse HEAD) npx expo start --host lan
  // Referencing it here is what makes Metro inline the value into the served
  // bundle, so it shows in About (SPEC-076 § 4.8). Store builds never set
  // it, so the row stays hidden there.
  const gitSha = process.env.EXPO_PUBLIC_GIT_SHA;

  const openLink = (url: string) => {
    onOpenChange(false);
    Linking.openURL(url);
  };

  const pushRoute = (href: string) => {
    onOpenChange(false);
    router.push(href as any);
  };

  const body = (
    <ScrollView style={{ maxHeight: 520 }}>
      <View className="items-center pt-4 pb-2">
        {logoSource && (
          <Image source={logoSource} className="mb-3 h-16 w-16 rounded-xl" resizeMode="contain" />
        )}
        <Text className="text-xl font-bold text-foreground">{t('title.app_name')}</Text>
        <Text className="mt-0.5 text-sm text-muted-foreground">{t('title.about')}</Text>
      </View>

      {/* Build info */}
      <View className="mt-4 rounded-xl border border-border bg-card p-4">
        <InfoRow icon={Package} label={t('label.version')} value={`v${version}`} />
        <InfoRow icon={Calendar} label={t('label.build_date')} value={formatDate(buildDate)} />
        {gitSha ? (
          <InfoRow icon={GitCommit} label={t('label.commit')} value={gitSha.slice(0, 12)} />
        ) : null}
        <InfoRow icon={Globe} label={t('label.environment')} value={environment} />
      </View>

      {/* Contact */}
      <View className="mt-3 rounded-xl border border-border bg-card p-4">
        <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('action.contact_us')}
        </Text>
        <LinkRow
          icon={Mail}
          label={t('action.email_support')}
          onPress={() => openLink('mailto:jon.long@zerotohero.ca')}
        />
        <LinkRow
          icon={MessageCircle}
          label={t('label.discord_server')}
          onPress={() => openLink('https://discord.gg/D7vKcuKXuA')}
        />
      </View>

      {/* Links */}
      <View className="mt-3 rounded-xl border border-border bg-card p-4">
        <LinkRow
          icon={BookOpen}
          label={t('title.docs')}
          onPress={() => pushRoute('/(tabs)/(me)/docs')}
        />
        <LinkRow
          icon={Wrench}
          label={t('title.tokenizer_test')}
          onPress={() => pushRoute('/(tabs)/(me)/tokenizer-test')}
        />
      </View>

      <Text className="py-4 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} Language Player
      </Text>
    </ScrollView>
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {isSm ? (
          <Dialog.Content>
            <View className="mb-2 flex-row items-center justify-between">
              <Dialog.Title>{t('title.about')}</Dialog.Title>
              <Dialog.Close className="rounded p-1 active:bg-muted">
                <X size={18} color={ICON_MUTED} />
              </Dialog.Close>
            </View>
            {body}
          </Dialog.Content>
        ) : (
          <Dialog.SheetContent>
            <View className="mb-2 flex-row items-center justify-between">
              <Dialog.Title>{t('title.about')}</Dialog.Title>
              <Dialog.Close className="rounded p-1 active:bg-muted">
                <X size={18} color={ICON_MUTED} />
              </Dialog.Close>
            </View>
            {body}
          </Dialog.SheetContent>
        )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}
