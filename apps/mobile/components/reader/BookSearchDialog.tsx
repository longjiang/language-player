import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, FlatList } from 'react-native';
import { useT } from '@/hooks/use-t';
import type { ContentBlock, TextBlock } from '@/lib/parse-markdown';
import { Search, X } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';

interface BookSearchDialogProps {
  visible: boolean;
  blocks: ContentBlock[] | null;
  /** Whole-book chapter labels (nearest preceding TOC entry per block). */
  chapterLabels?: { blockIndex: number; label: string }[];
  /** Called when the user taps a result — jump to the block's page. */
  onSelect: (blockIndex: number) => void;
  onClose: () => void;
}

interface Match {
  blockIndex: number;
  text: string;
  /** 0-based match offset within the block text. */
  offset: number;
  /** ~60 chars around the match. */
  snippet: string;
}

/**
 * In-book search (SPEC-049 §9.4/9.5): searches the current chapter's text
 * blocks for a term, shows snippets with the term highlighted, and jumps to
 * the page containing the tapped result.
 */
export function BookSearchDialog({ visible, blocks, chapterLabels = [], onSelect, onClose }: BookSearchDialogProps) {
  const t = useT();
  const [query, setQuery] = useState('');

  const labelForBlock = useMemo(() => {
    const sorted = [...chapterLabels].sort((a, b) => a.blockIndex - b.blockIndex);
    return (blockIndex: number): string | null => {
      let best: string | null = null;
      for (const c of sorted) {
        if (c.blockIndex <= blockIndex) best = c.label;
        else break;
      }
      return best;
    };
  }, [chapterLabels]);

  const matches = useMemo<Match[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q || !blocks) return [];
    const out: Match[] = [];
    blocks.forEach((block, blockIndex) => {
      if (block.kind !== 'text') return;
      const tb = block as TextBlock;
      if (tb.type !== 'paragraph' && tb.type !== 'blockquote' && tb.type !== 'list-item') return;
      const lower = tb.text.toLowerCase();
      let idx = lower.indexOf(q);
      while (idx !== -1 && out.length < 200) {
        const start = Math.max(0, idx - 30);
        const end = Math.min(tb.text.length, idx + query.length + 30);
        const snippet = (start > 0 ? '…' : '') + tb.text.slice(start, end) + (end < tb.text.length ? '…' : '');
        out.push({ blockIndex, text: tb.text, offset: idx, snippet });
        idx = lower.indexOf(q, idx + query.length);
      }
    });
    return out;
  }, [query, blocks]);

  if (!visible) return null;

  return (
    <View className="absolute inset-0 z-20 bg-background" style={{ elevation: 8 }}>
      {/* Header: input + close */}
      <View className="flex-row items-center gap-2 border-b border-border px-4 py-3">
        <Search size={16} color={ICON_MUTED} />
        <TextInput
          className="flex-1 text-sm text-foreground"
          value={query}
          onChangeText={setQuery}
          placeholder={t('placeholder.search_dots')}
          placeholderTextColor={ICON_MUTED}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} className="p-1">
            <X size={16} color={ICON_MUTED} />
          </Pressable>
        ) : null}
        <Pressable onPress={onClose} className="rounded bg-muted px-3 py-1.5 active:opacity-70">
          <Text className="text-xs text-muted-foreground">{t('action.close')}</Text>
        </Pressable>
      </View>

      {/* Results */}
      {query.trim() ? (
        <>
          <Text className="px-4 py-2 text-xs text-muted-foreground">
            {t('msg.result_count', { count: matches.length })}
          </Text>
          <FlatList
            data={matches}
            keyExtractor={(m, i) => `${m.blockIndex}-${m.offset}-${i}`}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                onPress={() => onSelect(item.blockIndex)}
                className="border-b border-border px-4 py-2.5 active:bg-muted"
              >
                <Text className="text-sm leading-relaxed text-foreground" numberOfLines={2}>
                  <HighlightSnippet snippet={item.snippet} term={query.trim()} />
                </Text>
                {labelForBlock(item.blockIndex) ? (
                  <Text className="mt-0.5 text-[10px] font-medium text-primary/80" numberOfLines={1}>
                    {labelForBlock(item.blockIndex)}
                  </Text>
                ) : null}
                <Text className="mt-0.5 text-[10px] text-muted-foreground/70">
                  {t('action.go_to_page')}
                </Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <View className="items-center py-10">
                <Text className="text-sm text-muted-foreground">{t('msg.no_results')}</Text>
              </View>
            }
          />
        </>
      ) : (
        <View className="items-center py-10">
          <Search size={32} color={ICON_MUTED} style={{ opacity: 0.4 }} />
          <Text className="mt-2 text-sm text-muted-foreground">{t('placeholder.search_dots')}</Text>
        </View>
      )}
    </View>
  );
}

/** Render the snippet with the search term highlighted in primary color. */
function HighlightSnippet({ snippet, term }: { snippet: string; term: string }) {
  const idx = snippet.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return <Text>{snippet}</Text>;
  return (
    <Text>
      {snippet.slice(0, idx)}
      <Text className="font-bold text-primary">{snippet.slice(idx, idx + term.length)}</Text>
      {snippet.slice(idx + term.length)}
    </Text>
  );
}
