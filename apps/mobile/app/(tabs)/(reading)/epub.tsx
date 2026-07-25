import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Pressable, ScrollView, Image, ActivityIndicator } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { useEpub } from '@/hooks/use-epub';
import { TokenizedText } from '@/components/TokenizedText';
import { EpubChapterSidebar } from '@/components/reader/epub-chapter-sidebar';
import { parseMarkdownBlocks } from '@/lib/parse-markdown';
import type { TextBlock } from '@/lib/parse-markdown';
import { PYTHON_API_URL } from '@/lib/api-url';
import { BookOpen, Upload, X, Languages } from 'lucide-react-native';
import { ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';

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

  // ── Auto-translate text blocks when showTranslation is on ──
  useEffect(() => {
    if (!display.translation || !blocks || blocks.length === 0) return;
    // Only translate if no cached translations exist for these blocks
    if (Object.keys(blockTranslations).length > 0) return;
    const textBlocks = blocks.filter(b => b.type === 'paragraph' || b.type === 'blockquote' || b.type === 'list-item');
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
  }, [blocks, display.translation]);

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
        <View className="flex-1">
          {blocks && (
            <ScrollView className="flex-1 p-4">
              {blocks.map((block, bi) => {
                const textBlockIdx = blocks.filter(b => b.type === 'paragraph' || b.type === 'blockquote' || b.type === 'list-item').indexOf(block);
                const translation = textBlockIdx >= 0 ? blockTranslations[textBlockIdx] : undefined;
                return (
                <View key={bi} className="mb-3">
                  {block.type === 'heading' && (
                    <Text className={`mb-2 font-bold text-foreground ${block.depth === 1 ? 'text-xl' : 'text-lg'}`}>
                      {block.text}
                    </Text>
                  )}
                  {block.type === 'paragraph' && (
                    <View>
                      <TokenizedText text={block.text} l2Code={l2Lang.code} />
                      {display.translation && translation && (
                        <Text className="mt-1 text-sm leading-relaxed text-muted-foreground">{translation}</Text>
                      )}
                    </View>
                  )}
                  {block.type === 'blockquote' && (
                    <View className="border-l-2 border-muted-foreground/30 pl-3">
                      <TokenizedText text={block.text} l2Code={l2Lang.code} />
                      {display.translation && translation && (
                        <Text className="mt-1 text-sm leading-relaxed text-muted-foreground">{translation}</Text>
                      )}
                    </View>
                  )}
                  {block.type === 'list-item' && (
                    <View>
                      <View className="flex-row"><Text className="mr-2 text-muted-foreground">•</Text>
                        <View className="flex-1"><TokenizedText text={block.text} l2Code={l2Lang.code} /></View>
                      </View>
                      {display.translation && translation && (
                        <Text className="ml-4 mt-1 text-sm leading-relaxed text-muted-foreground">{translation}</Text>
                      )}
                    </View>
                  )}
                </View>
                );
              })}
            </ScrollView>
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
