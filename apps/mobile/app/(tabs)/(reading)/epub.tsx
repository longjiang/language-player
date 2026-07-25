import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, Pressable, Image, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { useEpub } from '@/hooks/use-epub';
import { TokenizedText } from '@/components/TokenizedText';
import { EpubChapterSidebar } from '@/components/reader/epub-chapter-sidebar';
import { parseMarkdownBlocks } from '@/lib/parse-markdown';
import type { TextBlock } from '@/lib/parse-markdown';
import { PYTHON_API_URL } from '@/lib/api-url';
import { BookOpen, Upload, X, Languages, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react-native';
import { ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';
import type { LemmatizedToken } from '@langplayer/shared';

export default function EpubReaderScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const { display, updateDisplay } = useSettingsContext();
  const t = useT();
  const [text, setText] = useState('');
  const [blocks, setBlocks] = useState<TextBlock[] | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [blockTranslations, setBlockTranslations] = useState<Record<number, string>>({});
  const [isTranslating, setIsTranslating] = useState(false);
  const translateGenRef = useRef(0);

  // ── Pagination state ──
  const [page, setPage] = useState(0);
  const [pageBreaks, setPageBreaks] = useState<number[]>([]);
  const [hasMeasured, setHasMeasured] = useState(false);
  const [measuredBlockCount, setMeasuredBlockCount] = useState(0);
  const [tokenCache, setTokenCache] = useState<Record<number, LemmatizedToken[]>>({});
  const [loadingTokens, setLoadingTokens] = useState(false);
  const tokenLoadGenRef = useRef(0);
  const blockHeightsRef = useRef<(number | null)[]>([]);

  const { height: windowHeight } = useWindowDimensions();

  const onChapterChange = useCallback((chapterText: string, _title: string) => {
    setText(chapterText);
    setBlockTranslations({});
    translateGenRef.current += 1;
  }, []);
  const epub = useEpub(onChapterChange);

  // Parse markdown for layout — TokenizedText handles its own tokenization
  useEffect(() => {
    if (!text.trim()) { setBlocks(null); return; }
    try { setBlocks(parseMarkdownBlocks(text)); } catch { setBlocks(null); }
  }, [text]);

  // ── Reset pagination & token cache when text (chapter) changes ──
  useEffect(() => {
    setPageBreaks([]);
    setHasMeasured(false);
    setMeasuredBlockCount(0);
    setTokenCache({});
    blockHeightsRef.current = [];
    setPage(0);
  }, [text]);

  // ── Compute visible blocks for the current page ──
  const visibleBlocks = useMemo(() => {
    if (!blocks) return null;
    if (pageBreaks.length === 0) return blocks;
    const start = page === 0 ? 0 : pageBreaks[page - 1]!;
    const end = page < pageBreaks.length ? pageBreaks[page]! : blocks.length;
    return blocks.slice(start, end);
  }, [blocks, pageBreaks, page]);

  const totalPages = Math.max(1, pageBreaks.length + 1);

  // ── Block height measurement ──
  const handleMeasureBlock = useCallback((index: number, height: number) => {
    const wasUnmeasured = blockHeightsRef.current[index] == null;
    blockHeightsRef.current[index] = height;
    if (wasUnmeasured) {
      setMeasuredBlockCount(c => c + 1);
    }
  }, []);

  // ── Compute page breaks when all blocks have been measured ──
  useEffect(() => {
    if (!blocks || blocks.length === 0) return;
    const heights = blockHeightsRef.current;
    if (heights.length < blocks.length || heights.some(h => h == null)) return;

    const availableHeight = windowHeight - 260; // header ~60 + padding ~40 + page nav ~50 + buffer
    const breaks: number[] = [];
    let accumulated = 0;

    for (let i = 0; i < blocks.length; i++) {
      const h = heights[i]!;
      if (accumulated + h > availableHeight && accumulated > 0) {
        breaks.push(i);
        accumulated = h;
      } else {
        accumulated += h;
      }
    }

    setPageBreaks(breaks);
    setPage(0);
    setHasMeasured(true);
  }, [blocks, windowHeight, measuredBlockCount]);

  // ── Batch lemmatize visible text blocks (per-page) ──
  useEffect(() => {
    if (!hasMeasured || !blocks || !visibleBlocks) return;
    const textBlocks = visibleBlocks.filter(b => b.type === 'paragraph' || b.type === 'blockquote' || b.type === 'list-item');
    if (textBlocks.length === 0) return;

    const missing: { idx: number; text: string }[] = [];
    for (const tb of textBlocks) {
      const globalIdx = blocks.indexOf(tb);
      if (!(globalIdx in tokenCache)) {
        missing.push({ idx: globalIdx, text: tb.text });
      }
    }
    if (missing.length === 0) return;

    const gen = ++tokenLoadGenRef.current;
    setLoadingTokens(true);
    fetch(`${PYTHON_API_URL}/lemmatize-normalized/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: missing.map(m => m.text), l2: l2Lang.code }),
    })
      .then(res => res.json())
      .then(data => {
        if (tokenLoadGenRef.current !== gen) return; // stale
        const results: LemmatizedToken[][] = data?.results ?? [];
        setTokenCache(prev => {
          const next = { ...prev };
          missing.forEach((m, i) => {
            if (results[i]) next[m.idx] = results[i]!;
          });
          return next;
        });
      })
      .catch(() => { /* ignore */ })
      .finally(() => {
        if (tokenLoadGenRef.current === gen) setLoadingTokens(false);
      });
  }, [hasMeasured, page, blocks, pageBreaks, visibleBlocks, tokenCache, l2Lang.code]);

  // ── Auto-translate visible text blocks (per-page) when showTranslation is on ──
  useEffect(() => {
    if (!display.translation || !hasMeasured || !blocks || !visibleBlocks) return;
    // Only translate if no cached translations exist for this page
    if (Object.keys(blockTranslations).length > 0) return;
    // Wait for tokens to finish loading first
    if (loadingTokens) return;
    const textBlocks = visibleBlocks.filter(b => b.type === 'paragraph' || b.type === 'blockquote' || b.type === 'list-item');
    if (textBlocks.length === 0) return;
    const gen = ++translateGenRef.current;
    setIsTranslating(true);
    const texts = textBlocks.map(b => b.text);
    fetch(`${PYTHON_API_URL}/translate_array`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts, l1: l1Lang.code, l2: l2Lang.code }),
    })
      .then(res => res.json())
      .then(data => {
        if (translateGenRef.current !== gen) return; // stale
        const translated = data?.translated_texts ?? [];
        if (translated.length > 0) {
          const map: Record<number, string> = {};
          textBlocks.forEach((_, i) => {
            if (i < translated.length) map[i] = translated[i]!;
          });
          setBlockTranslations(map);
        }
      })
      .catch(() => { /* ignore */ })
      .finally(() => {
        if (translateGenRef.current === gen) setIsTranslating(false);
      });
  }, [visibleBlocks, hasMeasured, display.translation, loadingTokens, blocks]);

  // ── Page navigation ──
  const prevPage = useCallback(() => {
    if (page <= 0) return;
    setPage(p => p - 1);
    setBlockTranslations({});
  }, [page]);

  const nextPage = useCallback(() => {
    if (page >= totalPages - 1) return;
    setPage(p => p + 1);
    setBlockTranslations({});
  }, [page, totalPages]);

  // ── Upload state ──
  if (!epub.fileName && !epub.loading) {
    return (
      <View className="flex-1 bg-background">
        <View className="px-4 py-5"><Text className="text-xl font-bold text-foreground">{t('title.epub_reader')}</Text></View>
        <View className="mx-4 flex-1 items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 p-10">
          <BookOpen size={48} color={ICON_MUTED} style={{ marginBottom: 16 }} />
          <Text className="mb-2 text-sm text-muted-foreground">{t('msg.drop_epub_here')}</Text>
          <Pressable onPress={epub.pickFile} className="mt-4 flex-row items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 active:bg-muted">
            <Upload size={16} color={ICON_MUTED} />
            <Text className="text-sm text-foreground">{t('action.browse')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Loading ──
  if (epub.loading && !epub.fileName) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={ICON_MUTED} />
      </View>
    );
  }

  // ── Cover ──
  if (epub.coverUrl && !epub.coverTapped) {
    return (
      <View className="flex-1 bg-background">
        <View className="px-4 py-5">
          <View className="flex-row items-center justify-between">
            <Text className="text-xl font-bold text-foreground">{epub.fileName}</Text>
            <Pressable onPress={epub.close} className="rounded p-1 active:bg-muted">
              <X size={18} color={ICON_MUTED} />
            </Pressable>
          </View>
        </View>
        <Pressable onPress={epub.openFromCover} className="flex-1 items-center justify-center px-4">
          <Image source={{ uri: epub.coverUrl }} className="max-h-[70vh] w-full rounded-lg" resizeMode="contain" />
          <Text className="mt-4 text-xs text-muted-foreground">{t('action.open_file')}</Text>
        </Pressable>
      </View>
    );
  }

  // ── Error ──
  if (epub.error) {
    return (
      <View className="flex-1 bg-background">
        <View className="px-4 py-5 flex-row items-center justify-between">
          <Text className="text-xl font-bold text-foreground">{epub.fileName}</Text>
          <Pressable onPress={epub.close} className="rounded p-1 active:bg-muted">
            <X size={18} color={ICON_MUTED} />
          </Pressable>
        </View>
        <View className="mx-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
          <Text className="text-sm text-destructive">{epub.error}</Text>
        </View>
      </View>
    );
  }

  // ── Reader ──
  return (
    <View className="flex-1 bg-background">
      <View className="px-4 py-5 flex-row items-center gap-3">
        <View className="flex-1 min-w-0">
          <Text className="text-xl font-bold text-foreground" numberOfLines={1}>
            {epub.chapterTitle || epub.fileName || t('title.epub_reader')}
          </Text>
          <Text className="text-xs text-muted-foreground">{l2Lang.name} → {l1Lang.name}</Text>
        </View>
        <Pressable onPress={epub.close} className="flex-row items-center gap-1 rounded px-2 py-1 active:bg-muted">
          <X size={14} color={ICON_MUTED} /><Text className="text-xs text-muted-foreground">{t('action.close')}</Text>
        </Pressable>
        <Pressable onPress={() => updateDisplay({ translation: !display.translation })} className="rounded p-1 active:bg-muted">
          <Languages size={20} color={display.translation ? ICON_PRIMARY : ICON_MUTED} />
        </Pressable>
        <Pressable onPress={() => setSidebarOpen(!sidebarOpen)} className="rounded p-1 active:bg-muted">
          <BookOpen size={20} color={ICON_MUTED} />
        </Pressable>
      </View>

      <View className="flex-1 flex-row">
        <View className="flex-1 flex-col">
          {blocks && !hasMeasured && (
            /* ── Measuring state: show loading spinner ── */
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="small" color={ICON_MUTED} />
            </View>
          )}

          {blocks && hasMeasured && visibleBlocks && (
            <View className="flex-1 flex-col">
              {/* ── Token loading indicator ── */}
              {loadingTokens && (
                <View className="flex-row items-center justify-center gap-2 py-2">
                  <Loader2 size={12} color={ICON_MUTED} />
                  <Text className="text-xs text-muted-foreground">{t('msg.making_words_interactive')}</Text>
                </View>
              )}

              {/* ── Paginated content (non-scrollable, like web) ── */}
              <View className="flex-1 px-4">
                {visibleBlocks.map((block, bi) => {
                  // Find text-block position among visibleBlocks' text blocks for translation lookup
                  const visibleTextBlocks = visibleBlocks.filter(
                    b => b.type === 'paragraph' || b.type === 'blockquote' || b.type === 'list-item'
                  );
                  const localIdx = visibleTextBlocks.indexOf(block);
                  const translation = localIdx >= 0 ? blockTranslations[localIdx] : undefined;
                  // Token cache key: global block index
                  const globalIdx = blocks.indexOf(block);
                  const cachedTokens = tokenCache[globalIdx];

                  return (
                    <View key={bi} className="mb-3">
                      {block.type === 'heading' && (
                        <Text className={`mb-2 font-bold text-foreground ${block.depth === 1 ? 'text-xl' : 'text-lg'}`}>
                          {block.text}
                        </Text>
                      )}
                      {block.type === 'paragraph' && (
                        <View>
                          <TokenizedText text={block.text} l2Code={l2Lang.code} tokens={cachedTokens} />
                          {display.translation && translation && (
                            <Text className="mt-1 text-sm leading-relaxed text-muted-foreground">{translation}</Text>
                          )}
                        </View>
                      )}
                      {block.type === 'blockquote' && (
                        <View className="border-l-2 border-muted-foreground/30 pl-3">
                          <TokenizedText text={block.text} l2Code={l2Lang.code} tokens={cachedTokens} />
                          {display.translation && translation && (
                            <Text className="mt-1 text-sm leading-relaxed text-muted-foreground">{translation}</Text>
                          )}
                        </View>
                      )}
                      {block.type === 'list-item' && (
                        <View>
                          <View className="flex-row"><Text className="mr-2 text-muted-foreground">•</Text>
                            <View className="flex-1"><TokenizedText text={block.text} l2Code={l2Lang.code} tokens={cachedTokens} /></View>
                          </View>
                          {display.translation && translation && (
                            <Text className="ml-4 mt-1 text-sm leading-relaxed text-muted-foreground">{translation}</Text>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>

              {/* ── Page navigation bar ── */}
              <View className="flex-shrink-0 flex-row items-center justify-center gap-4 border-t border-border py-2">
                <Pressable onPress={prevPage} disabled={page === 0}
                  className={`rounded p-1 ${page === 0 ? 'opacity-30' : 'active:bg-muted'}`}>
                  <ChevronLeft size={18} color={ICON_MUTED} />
                </Pressable>
                <Text className="text-xs text-muted-foreground">{page + 1} / {totalPages}</Text>
                <Pressable onPress={nextPage} disabled={page >= totalPages - 1}
                  className={`rounded p-1 ${page >= totalPages - 1 ? 'opacity-30' : 'active:bg-muted'}`}>
                  <ChevronRight size={18} color={ICON_MUTED} />
                </Pressable>
              </View>
            </View>
          )}

          {/* ── Hidden measuring view: renders all blocks to compute page breaks ── */}
          {blocks && (
            <View
              style={{ position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 }}
              pointerEvents="none"
              className="px-4"
            >
              {blocks.map((block, bi) => (
                <View key={`m-${bi}`} onLayout={(e) => handleMeasureBlock(bi, e.nativeEvent.layout.height)} className="mb-3">
                  {block.type === 'heading' && (
                    <Text className={`mb-2 font-bold text-foreground ${block.depth === 1 ? 'text-xl' : 'text-lg'}`}>
                      {block.text}
                    </Text>
                  )}
                  {block.type === 'paragraph' && (
                    <View>
                      {/* Empty tokens array — prevents TokenizedText from auto-fetching for hidden blocks */}
                      <TokenizedText text={block.text} l2Code={l2Lang.code} tokens={[]} />
                      {display.translation && (
                        <Text className="mt-1 text-sm leading-relaxed text-muted-foreground">{' '}</Text>
                      )}
                    </View>
                  )}
                  {block.type === 'blockquote' && (
                    <View className="border-l-2 border-muted-foreground/30 pl-3">
                      <TokenizedText text={block.text} l2Code={l2Lang.code} tokens={[]} />
                      {display.translation && (
                        <Text className="mt-1 text-sm leading-relaxed text-muted-foreground">{' '}</Text>
                      )}
                    </View>
                  )}
                  {block.type === 'list-item' && (
                    <View>
                      <View className="flex-row"><Text className="mr-2 text-muted-foreground">•</Text>
                        <View className="flex-1"><TokenizedText text={block.text} l2Code={l2Lang.code} tokens={[]} /></View>
                      </View>
                      {display.translation && (
                        <Text className="ml-4 mt-1 text-sm leading-relaxed text-muted-foreground">{' '}</Text>
                      )}
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>

        {sidebarOpen && (
          <EpubChapterSidebar
            toc={epub.toc}
            chapterHref={epub.chapterHref}
            prevHref={epub.prevHref} nextHref={epub.nextHref}
            onSelect={(href) => epub.loadChapter(href)}
            onPrev={epub.prevChapter} onNext={epub.nextChapter}
            onClose={() => setSidebarOpen(false)}
          />
        )}
      </View>
    </View>
  );
}
