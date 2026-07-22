import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, TextInput, ScrollView } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { SUPPORTED_L1S, SUPPORTED_L2S } from '@langplayer/shared';
import { PLACEHOLDER_COLOR } from '@/lib/theme-colors';
import { useT } from '@/hooks/use-t';
import enLocale from '@langplayer/shared/locales/en.json';

const enLangNames = (enLocale as any)?.lang ?? {};

function getLanguageName(code: string): string {
  return enLangNames[code] ?? code.toUpperCase();
}

/** Short code for the pill display (e.g. 'zh-Hans' → 'ZH', 'en' → 'EN'). */
function getLanguageCode(code: string): string {
  return code.split('-')[0]!.toUpperCase();
}

/** Top languages to show first in the L2 selector, matches Next.js. */
const POPULAR_LANGUAGES = [
  'en', 'zh-Hans', 'zh-Hant', 'zh', 'ja', 'ko', 'es', 'fr', 'de', 'it', 'pt', 'ru',
  'ar', 'hi', 'tr', 'nl', 'pl', 'sv', 'th', 'vi', 'id',
] as const;

interface LanguageList {
  popular: string[];
  rest: string[];
}

function useLanguageList(allCodes: readonly string[], search: string): LanguageList {
  return useMemo(() => {
    const q = search.toLowerCase();
    if (q) {
      // When searching, return flat filtered list as "popular" (no sections)
      const filtered = allCodes.filter(
        (c) => c.toLowerCase().includes(q) || getLanguageName(c).toLowerCase().includes(q),
      );
      return { popular: filtered as string[], rest: [] };
    }
    // Popular first, then the rest
    const popularSet = new Set(POPULAR_LANGUAGES);
    const popular = POPULAR_LANGUAGES.filter((c) => allCodes.includes(c as any));
    const rest = allCodes.filter((c) => !popularSet.has(c as any));
    return { popular: popular as string[], rest: rest as string[] };
  }, [allCodes, search]);
}

function LanguageOption({ code, onSelect }: { code: string; onSelect: (c: string) => void }) {
  return (
    <Pressable
      className="rounded-md px-2 py-1.5 active:bg-muted"
      onPress={() => onSelect(code)}
    >
      <Text className="text-sm text-foreground">{getLanguageName(code)}</Text>
      <Text className="text-xs text-muted-foreground">{code}</Text>
    </Pressable>
  );
}

export function LanguageSwitcher() {
  const { l1Lang, l2Lang, setL1Lang, setL2Lang, swapLanguages } = useLanguage();
  const t = useT();
  const [open, setOpen] = useState<'l1' | 'l2' | null>(null);
  const [search, setSearch] = useState('');

  const canSwap = (SUPPORTED_L1S as readonly string[]).includes(l2Lang.code);

  const l1List = useLanguageList(SUPPORTED_L1S, open === 'l1' ? search : '');
  const l2List = useLanguageList(SUPPORTED_L2S, open === 'l2' ? search : '');

  const handleSelect = (code: string) => {
    if (open === 'l1') setL1Lang(code);
    else setL2Lang(code);
    setOpen(null);
  };

  const renderLanguageList = (list: LanguageList) => (
    <>
      {list.popular.length > 0 && (
        <>
          {!search && list.rest.length > 0 && (
            <Text className="mb-0.5 mt-1 text-xs font-semibold text-muted-foreground">
              {t('msg.popular_languages')}
            </Text>
          )}
          {list.popular.map((code) => (
            <LanguageOption key={code} code={code} onSelect={handleSelect} />
          ))}
        </>
      )}
      {list.rest.length > 0 && (
        <>
          <View className="my-1 border-t border-border" />
          <Text className="mb-0.5 text-xs font-semibold text-muted-foreground">
            {t('msg.all_languages')}
          </Text>
          {list.rest.map((code) => (
            <LanguageOption key={code} code={code} onSelect={handleSelect} />
          ))}
        </>
      )}
    </>
  );

  return (
    <View className="flex-row items-center gap-1">
      <Pressable
        onPress={() => { setOpen(open === 'l1' ? null : 'l1'); setSearch(''); }}
        className="rounded-full bg-primary/10 px-2.5 py-1"
      >
        <Text className="text-xs font-bold text-primary" numberOfLines={1}>{getLanguageCode(l1Lang.code)}</Text>
      </Pressable>

      <Pressable
        onPress={() => { if (canSwap) swapLanguages(); }}
        className="rounded-full p-0.5"
        disabled={!canSwap}
      >
        <Text className={`text-xs ${canSwap ? 'text-foreground' : 'text-muted-foreground'}`}>⇄</Text>
      </Pressable>

      <Pressable
        onPress={() => { setOpen(open === 'l2' ? null : 'l2'); setSearch(''); }}
        className="rounded-full bg-accent/10 px-2.5 py-1"
      >
        <Text className="text-xs font-bold text-accent" numberOfLines={1}>{getLanguageCode(l2Lang.code)}</Text>
      </Pressable>

      {open && (
        <>
          <Pressable className="absolute inset-0 z-40" onPress={() => setOpen(null)} />
          <View className="absolute left-0 top-full z-50 mt-1 w-48 rounded-lg border border-border bg-card p-2 shadow-lg">
            <TextInput
              className="mb-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
              placeholder={t('placeholder.search_dots')}
              placeholderTextColor={PLACEHOLDER_COLOR}
              value={search}
              onChangeText={setSearch}
              autoFocus
            />
            <ScrollView className="max-h-64" keyboardShouldPersistTaps="handled">
              {open === 'l1' ? renderLanguageList(l1List) : renderLanguageList(l2List)}
            </ScrollView>
          </View>
        </>
      )}
    </View>
  );
}
