import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { BookOpen, FileText, ExternalLink } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { ICON_MUTED } from '@/lib/theme-colors';

/** Base URL for the web docs — adjust for your environment as needed. */
const WEB_BASE = 'https://languageplayer.com';

interface DocCategory {
  slug: string;
  titleKey: string;
}

/** Static list mirroring the web content/docs directory structure. */
const DOC_CATEGORIES: DocCategory[] = [
  { slug: 'general', titleKey: 'title.general' },
  { slug: 'getting-started', titleKey: 'title.getting_started' },
  { slug: 'media', titleKey: 'title.media' },
  { slug: 'reading', titleKey: 'title.reading' },
  { slug: 'vocab', titleKey: 'title.vocab' },
  { slug: 'account', titleKey: 'title.account' },
];

/** Resolve a human-readable label for a category slug via i18n. */
function categoryLabel(slug: string, t: ReturnType<typeof useT>): string {
  const key = `title.${slug}`;
  const translated = t(key);
  if (translated !== key) return translated;
  // Fallback: capitalize and replace hyphens
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DocsScreen() {
  const t = useT();
  const { l1Lang, l2Lang } = useLanguage();

  const openDoc = async (slug: string) => {
    const url = `${WEB_BASE}/${l1Lang.code}/${l2Lang.code}/docs/${slug}`;
    await WebBrowser.openBrowserAsync(url);
  };

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="flex-1 items-center px-4 py-12">
        <View className="w-full max-w-lg">
          {/* ── Header ── */}
          <View className="mb-8 items-center">
            <View className="mb-4 h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <BookOpen size={32} color={ICON_MUTED} />
            </View>
            <Text className="text-2xl font-bold text-foreground">
              {t('title.documentation')}
            </Text>
            <Text className="mt-1 text-sm text-muted-foreground">
              {t('docs.guides_reference')}
            </Text>
          </View>

          {/* ── Category list ── */}
          <View className="rounded-xl border border-border bg-card">
            {DOC_CATEGORIES.map((cat, i) => (
              <Pressable
                key={cat.slug}
                onPress={() => openDoc(cat.slug)}
                className={`flex-row items-center gap-3 px-4 py-3 active:bg-muted ${
                  i < DOC_CATEGORIES.length - 1 ? 'border-b border-border' : ''
                }`}
              >
                <FileText size={20} color={ICON_MUTED} />
                <Text className="flex-1 text-sm text-foreground">
                  {categoryLabel(cat.slug, t)}
                </Text>
                <ExternalLink size={14} color={ICON_MUTED} />
              </Pressable>
            ))}
          </View>

          {/* ── Footer note ── */}
          <View className="mt-6 items-center">
            <Text className="text-xs text-muted-foreground">
              {t('docs.guides_reference')}
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
