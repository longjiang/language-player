import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet } from 'react-native';
import { DOCS, DOC_CATEGORIES, type DocEntry, getDocsForLocale } from '@langplayer/shared';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';
import { Search, BookOpen } from 'lucide-react-native';

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#64748b', marginBottom: 20 },
  searchBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', marginBottom: 16 },
  searchInput: { flex: 1, fontSize: 14, color: '#0f172a', marginLeft: 8 },
  categoryChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 8, borderWidth: 1 },
  categoryText: { fontSize: 13, fontWeight: '600' },
  docCard: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, backgroundColor: '#fff', padding: 14, marginBottom: 10 },
  docTitle: { fontSize: 15, fontWeight: '600', color: '#0f172a', marginBottom: 4 },
  docContent: { fontSize: 13, color: '#64748b', lineHeight: 20 },
  categoryLabel: { fontSize: 11, fontWeight: '700', color: '#3b82f6', textTransform: 'uppercase', marginBottom: 4 },
  selectedDoc: { marginTop: 16 },
  selectedDocTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a', marginBottom: 16 },
  selectedDocBody: { fontSize: 14, lineHeight: 22, color: '#0f172a' },
  backBtn: { color: '#3b82f6', fontSize: 14, marginBottom: 16 },
  emptyText: { textAlign: 'center', marginTop: 60, fontSize: 14, color: '#94a3b8' },
});

export default function DocsScreen() {
  const t = useT();
  const [query, setQuery] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<DocEntry | null>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return DOCS;
    const q = query.toLowerCase();
    return DOCS.filter((d) => d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q));
  }, [query]);

  // Group by category
  const grouped = useMemo(() => {
    const map: Record<string, DocEntry[]> = {};
    for (const doc of filtered) {
      const cat = doc.category.replace(/-/g, ' ');
      if (!map[cat]) map[cat] = [];
      map[cat]!.push(doc);
    }
    return map;
  }, [filtered]);

  // Selected doc render
  if (selectedDoc) {
    return (
      <ScrollView style={S.root}>
        <Pressable onPress={() => setSelectedDoc(null)}><Text style={S.backBtn}>← {t('action.go_back')}</Text></Pressable>
        <Text style={S.selectedDocTitle}>{selectedDoc.title}</Text>
        <Text style={[S.categoryLabel, { marginBottom: 16 }]}>{selectedDoc.category}</Text>
        {/* Render doc content - strip markdown for now, render plain text */}
        <Text style={S.selectedDocBody}>{selectedDoc.content.replace(/\{\\\$[^}]+\}/g, '').replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')}</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={S.root}>
      <Text style={S.title}>{t('title.docs')}</Text>
      <Text style={S.subtitle}>Learn how to use Language Player to its full potential.</Text>

      {/* Search */}
      <View style={S.searchBox}>
        <Search size={16} color={ICON_MUTED} />
        <TextInput style={S.searchInput} placeholder={t('placeholder.filter')} placeholderTextColor="#94a3b8" value={query} onChangeText={setQuery} />
      </View>

      {/* Results */}
      {filtered.length === 0 ? (
        <View style={{ alignItems: 'center', marginTop: 40 }}>
          <BookOpen size={40} color={ICON_MUTED} style={{ opacity: 0.3 }} />
          <Text style={S.emptyText}>{t('msg.no_results')}</Text>
        </View>
      ) : (
        Object.entries(grouped).map(([cat, docs]) => (
          <View key={cat} style={{ marginBottom: 20 }}>
            <Text style={S.categoryLabel}>{cat}</Text>
            {docs.map((doc) => (
              <Pressable key={doc.path} onPress={() => setSelectedDoc(doc)} style={S.docCard}>
                <Text style={S.docTitle}>{doc.title}</Text>
                <Text style={S.docContent} numberOfLines={2}>
                  {doc.content.replace(/\{\\\$[^}]+\}/g, '{{t}}').replace(/\*\*/g, '').replace(/#{1,3} /g, '').substring(0, 200)}
                </Text>
              </Pressable>
            ))}
          </View>
        ))
      )}
    </ScrollView>
  );
}
