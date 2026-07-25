import { useState, useMemo } from 'react';
import { View, Text, TextInput, Pressable, FlatList, SectionList } from 'react-native';
import { router } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { PLACEHOLDER_COLOR } from '@/lib/theme-colors';
import { SUPPORTED_L1S } from '@langplayer/shared';

/** Top languages to show first, matching Next.js LanguagePicker. */
const POPULAR_LANGUAGES: string[] = [
  'en', 'zh-Hans', 'zh-Hant', 'zh', 'ja', 'ko', 'es', 'fr', 'de', 'it', 'pt', 'ru',
  'ar', 'hi', 'tr', 'nl', 'pl', 'sv', 'th', 'vi', 'id',
];

export default function SelectL1Screen() {
  const t = useT();
  const { setL1Lang } = useLanguage();
  const [search, setSearch] = useState('');

  const { popular, rest, searching } = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) {
      const popularSet = new Set(POPULAR_LANGUAGES);
      const pop = POPULAR_LANGUAGES.filter((c) => SUPPORTED_L1S.includes(c as any));
      const remaining = SUPPORTED_L1S.filter((c) => !popularSet.has(c as any));
      return { popular: pop, rest: remaining, searching: false };
    }
    const results = SUPPORTED_L1S.filter(
      (c) =>
        c.toLowerCase().includes(q) ||
        t('lang.' + c).toLowerCase().includes(q),
    );
    return { popular: results, rest: [], searching: true };
  }, [search]);

  const sections = useMemo(() => {
    const result: { title: string; data: string[] }[] = [];
    if (popular.length > 0) {
      result.push({
        title: searching ? '' : t('msg.popular_languages'),
        data: popular,
      });
    }
    if (rest.length > 0) {
      if (popular.length > 0 && !searching) {
        result.push({ title: '', data: [] }); // spacer
      }
      result.push({
        title: searching ? '' : t('msg.all_languages'),
        data: rest,
      });
    }
    return result;
  }, [popular, rest, searching]);

  const handleSelect = async (code: string) => {
    await setL1Lang(code);
    router.replace('/select-l2');
  };

  const renderItem = ({ item }: { item: string }) => (
    <Pressable
      className="bg-card border border-border rounded-lg px-4 py-3 mb-2 flex-row items-center justify-between"
      onPress={() => handleSelect(item)}
    >
      <Text className="text-foreground text-base">{t('lang.' + item)}</Text>
      <Text className="text-muted-foreground text-xs">{item.toUpperCase()}</Text>
    </Pressable>
  );

  const renderSectionHeader = ({ section }: { section: { title: string } }) => {
    if (!section.title) return <View className="h-2" />;
    return (
      <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-2 mt-1">
        {section.title}
      </Text>
    );
  };

  return (
    <View className="flex-1 bg-background p-6">
      <Text className="text-2xl font-bold text-foreground mb-2">
        {t('title.select_language')}
      </Text>
      <Text className="text-muted-foreground mb-4">
        {t('msg.choose_native_language')}
      </Text>

      <TextInput
        className="bg-card border border-border rounded-lg px-4 py-3 text-foreground mb-4"
        placeholder={t('placeholder.search_languages')}
        placeholderTextColor={PLACEHOLDER_COLOR}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
      />

      <SectionList
        sections={sections}
        keyExtractor={(item) => item}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}
