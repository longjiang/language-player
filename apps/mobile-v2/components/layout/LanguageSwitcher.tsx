import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { SUPPORTED_L1S, SUPPORTED_L2S } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';

export function LanguageSwitcher() {
  const { l1Lang, l2Lang, setL1Lang, setL2Lang, swapLanguages } = useLanguage();
  const t = useT();
  const [open, setOpen] = useState<'l1' | 'l2' | null>(null);
  const [search, setSearch] = useState('');

  const canSwap = (SUPPORTED_L1S as readonly string[]).includes(l2Lang.code);

  const filterList = (codes: readonly string[], q: string) => {
    const s = q.toLowerCase();
    return s ? codes.filter((c) => c.toLowerCase().includes(s) || c.includes(s)) : [...codes];
  };

  const l1List = filterList(SUPPORTED_L1S, open === 'l1' ? search : '');
  const l2List = filterList(SUPPORTED_L2S, open === 'l2' ? search : '');

  return (
    <View className="flex-row items-center gap-1">
      {/* L1 pill */}
      <Pressable
        onPress={() => { setOpen(open === 'l1' ? null : 'l1'); setSearch(''); }}
        className="rounded-full bg-primary/10 px-2.5 py-1"
      >
        <Text className="text-xs font-bold text-primary">{l1Lang.code.toUpperCase()}</Text>
      </Pressable>

      {/* Swap button */}
      <Pressable
        onPress={() => { if (canSwap) swapLanguages(); }}
        className="rounded-full p-0.5"
        disabled={!canSwap}
      >
        <Text className={`text-xs ${canSwap ? 'text-foreground' : 'text-muted-foreground'}`}>⇄</Text>
      </Pressable>

      {/* L2 pill */}
      <Pressable
        onPress={() => { setOpen(open === 'l2' ? null : 'l2'); setSearch(''); }}
        className="rounded-full bg-accent/10 px-2.5 py-1"
      >
        <Text className="text-xs font-bold text-accent">{l2Lang.code.toUpperCase()}</Text>
      </Pressable>

      {/* Dropdown */}
      {open && (
        <>
          <Pressable className="absolute inset-0 z-40" onPress={() => setOpen(null)} />
          <View className="absolute left-0 top-full z-50 mt-1 w-48 rounded-lg border border-border bg-card p-2 shadow-lg">
            <TextInput
              className="mb-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
              placeholder={t('action.search')}
              placeholderTextColor="#888"
              value={search}
              onChangeText={setSearch}
              autoFocus
            />
            <ScrollView className="max-h-64">
              {(open === 'l1' ? l1List : l2List).map((code) => (
                <Pressable
                  key={code}
                  className="rounded-md px-2 py-1.5 active:bg-muted"
                  onPress={() => {
                    if (open === 'l1') setL1Lang(code);
                    else setL2Lang(code);
                    setOpen(null);
                  }}
                >
                  <Text className="text-sm text-foreground">{code}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </>
      )}
    </View>
  );
}
