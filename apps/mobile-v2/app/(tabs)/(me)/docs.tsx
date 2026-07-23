import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet } from 'react-native';
import { getDocsForLocale, type DocEntryI18n } from '@langplayer/docs';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { ICON_MUTED } from '@/lib/theme-colors';
import { Search, BookOpen } from 'lucide-react-native';

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#64748b', marginBottom: 20 },
  searchBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', marginBottom: 16 },
  searchInput: { flex: 1, fontSize: 14, color: '#0f172a', marginLeft: 8 },
  docCard: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, backgroundColor: '#fff', padding: 14, marginBottom: 10 },
  docTitle: { fontSize: 15, fontWeight: '600', color: '#0f172a', marginBottom: 4 },
  docContent: { fontSize: 13, color: '#64748b', lineHeight: 20 },
  categoryLabel: { fontSize: 11, fontWeight: '700', color: '#3b82f6', textTransform: 'uppercase', marginBottom: 6 },
  selectedTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a', marginBottom: 16 },
  selectedBody: { fontSize: 14, lineHeight: 22, color: '#0f172a' },
  backBtn: { color: '#3b82f6', fontSize: 14, marginBottom: 16 },
  emptyText: { textAlign: 'center', marginTop: 60, fontSize: 14, color: '#94a3b8' },
});

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6} /gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

export default function DocsScreen() {
  const t = useT();
  const { l1Lang } = useLanguage();
  const [query, setQuery] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<DocEntryI18n | null>(null);

  const docs = useMemo(() => getDocsForLocale(l1Lang.code), [l1Lang.code]);

  const filtered = useMemo(() => {
    if (!query.trim()) return docs;
    const q = query.toLowerCase();
    return docs.filter((d) => d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q));
  }, [query, docs]);

  // Group by category (derived from slug)
  const grouped = useMemo(() => {
    const map: Record<string, DocEntryI18n[]> = {};
    for (const doc of filtered) {
      const cat = doc.slug.split('/')[0] ?? 'general';
      if (!map[cat]) map[cat] = [];
      map[cat]!.push(doc);
    }
    return map;
  }, [filtered]);

  if (selectedDoc) {
    return (
      <ScrollView style={S.root}>
        <Pressable onPress={() => setSelectedDoc(null)}><Text style={S.backBtn}>← {t('action.go_back')}</Text></Pressable>
        <Text style={S.selectedTitle}>{selectedDoc.title}</Text>
        <Text style={[S.categoryLabel, { marginBottom: 16 }]}>{selectedDoc.slug.split('/')[0]}</Text>
        <Text style={S.selectedBody}>{stripMarkdown(selectedDoc.content)}</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={S.root}>
      <Text style={S.title}>{t('title.docs')}</Text>
      <Text style={S.subtitle}>Learn how to use Language Player to its full potential.</Text>

      <View style={S.searchBox}>
        <Search size={16} color={ICON_MUTED} />
        <TextInput style={S.searchInput} placeholder={t('placeholder.filter')} placeholderTextColor="#94a3b8" value={query} onChangeText={setQuery} />
      </View>

      {filtered.length === 0 ? (
        <View style={{ alignItems: 'center', marginTop: 40 }}>
          <BookOpen size={40} color={ICON_MUTED} style={{ opacity: 0.3 }} />
          <Text style={S.emptyText}>{t('msg.no_results')}</Text>
        </View>
      ) : (
        Object.entries(grouped).map(([cat, catDocs]) => (
          <View key={cat} style={{ marginBottom: 20 }}>
            <Text style={S.categoryLabel}>{cat}</Text>
            {catDocs.map((doc) => (
              <Pressable key={doc.slug} onPress={() => setSelectedDoc(doc)} style={S.docCard}>
                <Text style={S.docTitle}>{doc.title}</Text>
                <Text style={S.docContent} numberOfLines={2}>{stripMarkdown(doc.content).substring(0, 200)}</Text>
              </Pressable>
            ))}
          </View>
        ))
      )}
    </ScrollView>
  );
}
