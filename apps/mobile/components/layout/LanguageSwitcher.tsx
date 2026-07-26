import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, Pressable, TextInput, ScrollView } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDictionaryContext } from '@/contexts/DictionaryContext';
import { SUPPORTED_L1S, SUPPORTED_L2S } from '@langplayer/shared';
import { useDialogOpen } from '@/lib/animations';
import { PLACEHOLDER_COLOR } from '@/lib/theme-colors';
import { useT } from '@/hooks/use-t';
import * as Dialog from '@/components/ui/dialog';
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

function LanguagePickerContent({
  allCodes,
  search,
  onSearchChange,
  onSelect,
}: {
  allCodes: readonly string[];
  search: string;
  onSearchChange: (s: string) => void;
  onSelect: (code: string) => void;
}) {
  const t = useT();
  const list = useLanguageList(allCodes, search);

  return (
    <Dialog.SheetContent>
      <TextInput
        className="mb-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        placeholder={t('placeholder.search_dots')}
        placeholderTextColor={PLACEHOLDER_COLOR}
        value={search}
        onChangeText={onSearchChange}
        autoFocus
      />
      <ScrollView className="max-h-80" keyboardShouldPersistTaps="handled">
        {list.popular.length > 0 && (
          <>
            {!search && list.rest.length > 0 && (
              <Text className="mb-0.5 mt-1 text-xs font-semibold text-muted-foreground">
                {t('msg.popular_languages')}
              </Text>
            )}
            {list.popular.map((code) => (
              <LanguageOption key={code} code={code} onSelect={onSelect} />
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
              <LanguageOption key={code} code={code} onSelect={onSelect} />
            ))}
          </>
        )}
      </ScrollView>
    </Dialog.SheetContent>
  );
}

export function LanguageSwitcher() {
  const { l1Lang, l2Lang, setL1Lang, setL2Lang, swapLanguages } = useLanguage();
  const { isOfflineAvailable } = useDictionaryContext();
  const t = useT();
  const [l1Open, setL1Open] = useDialogOpen();
  const [l2Open, setL2Open] = useDialogOpen();
  const [search, setSearch] = useState('');
  const [hasOfflineDict, setHasOfflineDict] = useState(false);
  const [activePicker, setActivePicker] = useState<'l1' | 'l2' | null>(null);

  const canSwap = (SUPPORTED_L1S as readonly string[]).includes(l2Lang.code);

  useEffect(() => {
    isOfflineAvailable(l2Lang.code).then(setHasOfflineDict).catch(() => setHasOfflineDict(false));
  }, [l2Lang.code]);

  const handleSelect = (code: string) => {
    if (activePicker === 'l1') setL1Lang(code);
    else setL2Lang(code);
    setSearch('');
    if (activePicker === 'l1') setL1Open(false);
    else setL2Open(false);
  };

  const handleL1OpenChange = (open: boolean) => {
    setL1Open(open);
    if (open) { setActivePicker('l1'); setSearch(''); }
  };

  const handleL2OpenChange = (open: boolean) => {
    setL2Open(open);
    if (open) { setActivePicker('l2'); setSearch(''); }
  };

  return (
    <View className="flex-row items-center gap-1">
      {/* L1 language picker */}
      <Dialog.Root open={l1Open} onOpenChange={handleL1OpenChange}>
        <Dialog.Trigger className="rounded-full bg-primary/10 px-2.5 py-1">
          <Text className="text-xs font-bold text-primary" numberOfLines={1}>
            {getLanguageCode(l1Lang.code)}
          </Text>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay closeOnPress />
          <LanguagePickerContent
            allCodes={SUPPORTED_L1S}
            search={search}
            onSearchChange={setSearch}
            onSelect={handleSelect}
          />
        </Dialog.Portal>
      </Dialog.Root>

      {/* Swap button */}
      <Pressable
        onPress={() => { if (canSwap) swapLanguages(); }}
        className="rounded-full p-0.5"
        disabled={!canSwap}
      >
        <Text className={`text-xs ${canSwap ? 'text-foreground' : 'text-muted-foreground'}`}>⇄</Text>
      </Pressable>

      {/* L2 language picker */}
      <Dialog.Root open={l2Open} onOpenChange={handleL2OpenChange}>
        <Dialog.Trigger className="rounded-full bg-accent/10 px-2.5 py-1">
          <Text className="text-xs font-bold text-accent" numberOfLines={1}>
            {getLanguageCode(l2Lang.code)}
          </Text>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay closeOnPress />
          <LanguagePickerContent
            allCodes={SUPPORTED_L2S}
            search={search}
            onSearchChange={setSearch}
            onSelect={handleSelect}
          />
        </Dialog.Portal>
      </Dialog.Root>

      {hasOfflineDict && (
        <View className="h-1.5 w-1.5 rounded-full bg-green-500 -ml-0.5" />
      )}
    </View>
  );
}
