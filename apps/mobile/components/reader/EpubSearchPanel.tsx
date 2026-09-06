import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { SearchBar } from '@/components/ui/search-bar';
import { findTextMatches } from '@langplayer/utils';
import { Search } from 'lucide-react-native';
import { useT } from '@/hooks/use-t';
import { ICON_MUTED } from '@/lib/theme-colors';
import type { ContentBlock, TextBlock } from '@/lib/parse-markdown';

interface EpubSearchPanelProps {
  blocks: ContentBlock[] | null;
  /** Whole-book chapter labels (nearest preceding TOC entry per block). */
  chapterLabels?: { blockIndex: number; label: string }[];
  /** Called when the user taps a result — jump to the block and highlight it. */
  onSelect: (match: { blockIndex: number; start: number; end: number }) => void;
  /** Pre-fill the query when `queryNonce` changes (quote chips). */
  initialQuery?: string;
  /** Bump to re-apply the `initialQuery`. */
  queryNonce?: number;
}

interface Match {
  blockIndex: number;
  text: string;
  /** 0-based match offset within the ORIGINAL block text. */
  offset: number;
  /** Exclusive match end within the ORIGINAL block text. */
  end: number;
  /** ~60 chars around the match. */
  snippet: string;
  /** Char offset of the match inside `snippet` (after any leading …). */
  snippetMatchStart: number;
  /** Length of the matched text inside `snippet`. */
  snippetMatchLen: number;
}

/**
 * In-book search body for the EPUB sidebar (SPEC-049 §9.4/9.5) — content-only
 * version of BookSearchDialog, rendered inside the shared sidebar's tabs.
 */
export function EpubSearchPanel({ blocks, chapterLabels = [], onSelect, initialQuery, queryNonce }: EpubSearchPanelProps) {
  const t = useT();
  const [query, setQuery] = useState('');

  // Pre-fill the query when the parent opens the panel for a specific quote.
  useEffect(() => {
    if (initialQuery && queryNonce != null) setQuery(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryNonce]);

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
    if (!blocks) return [];
    const out: Match[] = [];
    blocks.forEach((block, blockIndex) => {
      if (block.kind !== 'text') return;
      const tb = block as TextBlock;
      if (tb.type !== 'paragraph' && tb.type !== 'blockquote' && tb.type !== 'list-item') return;
      // Invisible-char- / whitespace-robust matching (U+200B etc.); matches
      // come back in the ORIGINAL block text coordinates.
      const mt = findTextMatches(tb.text, query, 200 - out.length);
      for (const m of mt) {
        const start = Math.max(0, m.start - 30);
        const end = Math.min(tb.text.length, m.end + 30);
        const snippet = (start > 0 ? '…' : '') + tb.text.slice(start, end) + (end < tb.text.length ? '…' : '');
        const snippetMatchStart = m.start - start + (start > 0 ? 1 : 0);
        const snippetMatchLen = m.end - m.start;
        out.push({ blockIndex, text: tb.text, offset: m.start, end: m.end, snippet, snippetMatchStart, snippetMatchLen });
      }
    });
    return out;
  }, [query, blocks]);

  return (
    <View className="flex-1 p-2">
      {/* Search bar — pinned at the top of the fixed-height modal; it never
          scrolls or re-positions (SPEC-085 §9). */}
      <View className="pb-2">
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder={t('placeholder.search_dots')}
          inputProps={{ autoFocus: true }}
        />
      </View>

      {query.trim() ? (
        <>
          <Text className="px-1 pb-1 text-xs text-muted-foreground">
            {t('msg.result_count', { count: matches.length })}
          </Text>
          {matches.length === 0 ? (
            /* Empty result set — the reserved area keeps the modal height
               (SPEC-085 §9). */
            <View className="flex-1 items-center justify-center">
              <Text className="text-sm text-muted-foreground">{t('msg.no_results')}</Text>
            </View>
          ) : (
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
              {matches.map((m, i) => (
                <Pressable
                  key={`${m.blockIndex}-${m.offset}-${i}`}
                  onPress={() => onSelect({
                    blockIndex: m.blockIndex,
                    start: m.offset,
                    end: m.end,
                  })}
                  className="border-b border-border px-1 py-2.5 active:bg-muted"
                >
                  <Text className="text-sm leading-relaxed text-foreground" numberOfLines={2}>
                    <HighlightSnippet
                      snippet={m.snippet}
                      matchStart={m.snippetMatchStart}
                      matchLen={m.snippetMatchLen}
                    />
                  </Text>
                  {labelForBlock(m.blockIndex) ? (
                    <Text className="mt-0.5 text-xs font-medium text-primary/80" numberOfLines={1}>
                      {labelForBlock(m.blockIndex)}
                    </Text>
                  ) : null}
                  <Text className="mt-0.5 text-[10px] text-muted-foreground/70">
                    {t('action.go_to_page')}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </>
      ) : (
        /* Initial state — reserved empty area keeps the modal height and the
           search bar above the software keyboard (SPEC-085 §9.4). */
        <View className="flex-1 items-center justify-center">
          <Search size={32} color={ICON_MUTED} style={{ opacity: 0.4 }} />
          <Text className="mt-2 text-sm text-muted-foreground">{t('placeholder.search_dots')}</Text>
        </View>
      )}
    </View>
  );
}

/** Render the snippet with the matched range highlighted in primary color. */
function HighlightSnippet({
  snippet,
  matchStart,
  matchLen,
}: {
  snippet: string;
  matchStart: number;
  matchLen: number;
}) {
  if (matchLen <= 0 || matchStart < 0 || matchStart + matchLen > snippet.length) {
    return <Text>{snippet}</Text>;
  }
  return (
    <Text>
      {snippet.slice(0, matchStart)}
      <Text className="font-bold text-primary">{snippet.slice(matchStart, matchStart + matchLen)}</Text>
      {snippet.slice(matchStart + matchLen)}
    </Text>
  );
}
