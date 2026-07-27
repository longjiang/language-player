import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, TextInput } from 'react-native';
import { DOCS, DOCS_BY_LOCALE, type DocEntry } from '@langplayer/shared';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { ICON_MUTED } from '@/lib/theme-colors';
import { MarkdownText } from '@/components/MarkdownText';
import { Search, BookOpen, List } from 'lucide-react-native';
import { PageContainer } from '@/components/layout/PageContainer';

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6} /gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

/** Extract H2 headings from markdown content. Returns { text, anchor } pairs. */
function extractHeadings(content: string): { text: string; anchor: string }[] {
  const headings: { text: string; anchor: string }[] = [];
  const regex = /^## (.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const text = match[1]!.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1');
    const anchor = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    headings.push({ text, anchor });
  }
  return headings;
}

/** Map a category slug to its translation key — matches Next.js CategoryTitle pattern. */
function categoryKey(slug: string): string {
  return `title.${slug}`;
}

export default function DocsScreen() {
  const t = useT();
  const { l1Lang } = useLanguage();
  const [query, setQuery] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<DocEntry | null>(null);

  const localeDocs = useMemo(() => DOCS_BY_LOCALE[l1Lang.code] ?? DOCS, [l1Lang.code]);

  const filtered = useMemo(() => {
    if (!query.trim()) return localeDocs;
    const q = query.toLowerCase();
    return localeDocs.filter((d) => d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q));
  }, [query, localeDocs]);

  // Split into root-level (no / in path) and categorized docs
  const { rootDocs, categorizedDocs } = useMemo(() => {
    const roots: DocEntry[] = [];
    const cats: DocEntry[] = [];
    for (const doc of filtered) {
      if (doc.path.includes('/')) {
        cats.push(doc);
      } else {
        roots.push(doc);
      }
    }
    return { rootDocs: roots, categorizedDocs: cats };
  }, [filtered]);

  // Group categorized docs by category
  const grouped = useMemo(() => {
    const map: Record<string, DocEntry[]> = {};
    for (const doc of categorizedDocs) {
      const cat = doc.category || 'general';
      if (!map[cat]) map[cat] = [];
      map[cat]!.push(doc);
    }
    return map;
  }, [categorizedDocs]);

  // ── Selected doc detail view ──
  if (selectedDoc) {
    const isRootDoc = !selectedDoc.path.includes('/');
    const headings = extractHeadings(selectedDoc.content);
    return (
      <PageContainer>
        <ScrollView className="flex-1 px-4 py-5">
        <Pressable onPress={() => setSelectedDoc(null)} className="mb-4">
          <Text className="text-sm text-primary">← {t('action.go_back')}</Text>
        </Pressable>

        <Text className="text-xl font-bold text-foreground mb-2">{selectedDoc.title}</Text>
        {!isRootDoc && (
          <Text className="text-xs font-bold text-primary uppercase mb-4">
            {t(categoryKey(selectedDoc.category || 'general'))}
          </Text>
        )}

        {/* ── On this page (heading TOC) ── */}
        {headings.length > 1 && (
          <View className="mb-5 rounded-xl border border-border bg-card p-3">
            <View className="flex-row items-center gap-1.5 mb-2">
              <List size={14} color={ICON_MUTED} />
              <Text className="text-xs font-semibold text-muted-foreground uppercase">{t('label.on_this_page')}</Text>
            </View>
            {headings.map((h, i) => (
              <Pressable key={i} className="py-1.5">
                <Text className="text-sm text-primary leading-5">{h.text}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* ── Markdown content ── */}
        <View className="rounded-xl border border-border bg-card p-4">
          <MarkdownText>{selectedDoc.content}</MarkdownText>
        </View>
        </ScrollView>
      </PageContainer>
    );
  }

  // ── Doc listing view ──
  return (
    <PageContainer>
      <ScrollView className="flex-1 px-4 py-5">
      <Text className="text-2xl font-bold text-foreground mb-1">{t('title.docs')}</Text>

      {/* Search */}
      <View className="flex-row items-center border border-border rounded-xl px-3 py-2.5 bg-card mb-4 mt-5">
        <Search size={16} color={ICON_MUTED} />
        <TextInput
          className="flex-1 ml-2 text-sm text-foreground"
          placeholder={t('placeholder.filter')}
          placeholderTextColor={ICON_MUTED}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {filtered.length === 0 ? (
        <View className="items-center mt-10">
          <BookOpen size={40} color={ICON_MUTED} style={{ opacity: 0.3 }} />
          <Text className="text-center mt-4 text-sm text-muted-foreground">{t('msg.no_results')}</Text>
        </View>
      ) : (
        <>
          {/* Root-level docs (no / in path) — shown without category label */}
          {rootDocs.length > 0 && (
            <View className="mb-5">
              {rootDocs.map((doc) => (
                <Pressable
                  key={doc.path}
                  onPress={() => setSelectedDoc(doc)}
                  className="border border-border rounded-xl bg-card p-3.5 mb-2.5"
                >
                  <Text className="text-base font-semibold text-foreground mb-1">{doc.title}</Text>
                  <Text className="text-sm text-muted-foreground leading-5" numberOfLines={2}>
                    {stripMarkdown(doc.content).substring(0, 200)}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Categorized docs — grouped under translated category labels */}
          {Object.entries(grouped).map(([cat, catDocs]) => (
            <View key={cat} className="mb-5">
              <Text className="text-xs font-bold text-primary uppercase mb-1.5">
                {t(categoryKey(cat))}
              </Text>
              {catDocs.map((doc) => (
                <Pressable
                  key={doc.path}
                  onPress={() => setSelectedDoc(doc)}
                  className="border border-border rounded-xl bg-card p-3.5 mb-2.5"
                >
                  <Text className="text-base font-semibold text-foreground mb-1">{doc.title}</Text>
                  <Text className="text-sm text-muted-foreground leading-5" numberOfLines={2}>
                    {stripMarkdown(doc.content).substring(0, 200)}
                  </Text>
                </Pressable>
              ))}
            </View>
          ))}
        </>
      )}
      </ScrollView>
    </PageContainer>
  );
}
