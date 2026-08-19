import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Button, buttonTextClass } from '@/components/ui/button';
import { Pressable } from '@/components/ui/pressable';
import { SearchBar } from '@/components/ui/search-bar';
import { useLocalSearchParams } from 'expo-router';
import { DOCS, DOCS_BY_LOCALE, type DocEntry } from '@langplayer/shared';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { useResponsive } from '@/hooks/use-responsive';
import { ICON_MUTED } from '@/lib/theme-colors';
import { MarkdownText } from '@/components/MarkdownText';
import { BookOpen, List, X } from 'lucide-react-native';
import { PageContainer } from '@/components/layout/PageContainer';

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6} /gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

/** Slugify a heading for the TOC anchor — matches apps/web (rehype-slug). */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Extract H2/H3 headings from markdown content (matches web's extractToc). */
function extractToc(content: string): { level: number; text: string; id: string }[] {
  const headings: { level: number; text: string; id: string }[] = [];
  const regex = /^(##|###) (.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const level = match[1]!.length;
    const text = match[2]!.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1');
    headings.push({ level, text, id: slugify(text) });
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
  const { path: pathParam } = useLocalSearchParams<{ path?: string }>();
  const { isXl } = useResponsive();
  const [query, setQuery] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<DocEntry | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const headingOffsets = useRef<Record<string, number>>({});
  const [markdownY, setMarkdownY] = useState(0);

  const localeDocs = useMemo(() => DOCS_BY_LOCALE[l1Lang.code] ?? DOCS, [l1Lang.code]);

  // Web /docs/[...slug] links (SPEC-069) open the matching doc directly.
  useEffect(() => {
    const p = typeof pathParam === 'string' ? pathParam : '';
    if (!p) return;
    const doc = (DOCS_BY_LOCALE[l1Lang.code] ?? DOCS).find((d) => d.path === p);
    if (doc) {
      setSelectedDoc(doc);
      setTocOpen(false);
      headingOffsets.current = {};
    }
  }, [pathParam, l1Lang.code]);

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

  const handleSelectDoc = (doc: DocEntry) => {
    setSelectedDoc(doc);
    setTocOpen(false);
    headingOffsets.current = {};
  };

  const scrollToHeading = (id: string) => {
    const y = (headingOffsets.current[id] ?? 0) + markdownY - 12;
    scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: true });
    setTocOpen(false);
  };

  // Heading render-rule overrides record each heading's offset for TOC scrolling.
  const makeHeadingRule = (level: 2 | 3) => (
    node: any,
    children: any[],
    _parent: any[],
    styles: any,
  ) => {
    const raw = String(node.content ?? '');
    const text = raw.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1');
    const id = slugify(text);
    return (
      <View
        key={node.key}
        style={styles[`_VIEW_SAFE_heading${level}`]}
        onLayout={(e) => {
          headingOffsets.current[id] = e.nativeEvent.layout.y;
        }}
      >
        {children}
      </View>
    );
  };

  // ── Selected doc detail view ──
  if (selectedDoc) {
    const isRootDoc = !selectedDoc.path.includes('/');
    const headings = extractToc(selectedDoc.content);

    const tocSidebar = (
      <View className="flex-1">
        <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('docs.table_of_contents')}
        </Text>
        <ScrollView className="flex-1">
          {rootDocs.map((doc) => (
            <Pressable key={doc.path} onPress={() => handleSelectDoc(doc)} className="py-1.5 active:bg-muted">
              <Text
                className={
                  doc.path === selectedDoc.path
                    ? 'text-sm font-medium text-primary'
                    : 'text-sm text-foreground'
                }
              >
                {doc.title}
              </Text>
            </Pressable>
          ))}
          {Object.entries(grouped).map(([cat, catDocs]) => (
            <View key={cat} className="mt-3">
              <Text className="mb-1 text-xs font-bold uppercase text-muted-foreground">
                {t(categoryKey(cat))}
              </Text>
              {catDocs.map((doc) => (
                <Pressable key={doc.path} onPress={() => handleSelectDoc(doc)} className="py-1.5 active:bg-muted">
                  <Text
                    className={
                      doc.path === selectedDoc.path
                        ? 'text-sm font-medium text-primary'
                        : 'text-sm text-foreground'
                    }
                  >
                    {doc.title}
                  </Text>
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>

        {headings.length > 0 && (
          <View className="mt-4 border-t border-border pt-3">
            <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('docs.on_this_page')}
            </Text>
            {headings.map((h) => (
              <Pressable
                key={h.id}
                onPress={() => scrollToHeading(h.id)}
                className="py-1.5 active:bg-muted"
                style={{ paddingLeft: 4 + (h.level - 2) * 12 }}
              >
                <Text className="text-sm text-muted-foreground">{h.text}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    );

    const docContent = (
      <>
        <Button variant="link" onPress={() => setSelectedDoc(null)} className="mb-4 self-start">
          <Text className={buttonTextClass('link')}>← {t('action.back')}</Text>
        </Button>

        <Text className="text-xl font-bold text-foreground mb-2">{selectedDoc.title}</Text>
        {!isRootDoc && (
          <Text className="text-xs font-bold text-primary uppercase mb-4">
            {t(categoryKey(selectedDoc.category || 'general'))}
          </Text>
        )}

        {/* ── Markdown content — web-style prose, no card panel ── */}
        <View onLayout={(e) => setMarkdownY(e.nativeEvent.layout.y)}>
          <MarkdownText
            rules={{
              heading2: makeHeadingRule(2),
              heading3: makeHeadingRule(3),
            }}
          >
            {selectedDoc.content}
          </MarkdownText>
        </View>
      </>
    );

    return (
      <PageContainer maxWidth="7xl">
        {isXl ? (
          /* ≥1280: persistent right-side TOC (matches web's sticky xl sidebar). */
          <View className="flex-1 flex-row">
            <ScrollView ref={scrollRef} className="flex-1 px-4 py-5">
              <View className="w-full max-w-3xl">{docContent}</View>
            </ScrollView>
            <View className="w-56 shrink-0 border-l border-border p-4">{tocSidebar}</View>
          </View>
        ) : (
          <>
            <ScrollView ref={scrollRef} className="flex-1 px-4 py-5">
              <View className="w-full max-w-3xl">{docContent}</View>
            </ScrollView>

            {/* Slide-in TOC below xl, matching web's xl:hidden drawer. */}
            {tocOpen && (
              <>
                <Pressable
                  className="absolute inset-0 z-40 bg-black/30"
                  onPress={() => setTocOpen(false)}
                />
                <View className="absolute bottom-0 right-0 top-0 z-50 w-72 border-l border-border bg-background p-4">
                  <View className="mb-3 flex-row items-center justify-between">
                    <Text className="text-sm font-semibold text-foreground">
                      {t('docs.table_of_contents')}
                    </Text>
                    <Button variant="ghost" size="icon" onPress={() => setTocOpen(false)}>
                      <X size={18} color={ICON_MUTED} />
                    </Button>
                  </View>
                  {tocSidebar}
                </View>
              </>
            )}

            <Button
              onPress={() => setTocOpen(true)}
              variant="outline"
              size="icon"
              className="absolute right-4 top-4 z-50"
              accessibilityLabel={t('docs.table_of_contents')}
            >
              <List size={18} color={ICON_MUTED} />
            </Button>
          </>
        )}
      </PageContainer>
    );
  }

  // ── Doc listing view ──
  return (
    <PageContainer>
      <ScrollView className="flex-1 px-4 py-5">
      <Text className="text-2xl font-bold text-foreground mb-1">{t('title.docs')}</Text>

      {/* Search */}
      <View className="mb-4 mt-5">
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder={t('placeholder.filter')}
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
