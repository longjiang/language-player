import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Image, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSavedWords } from '@/hooks/use-saved-words';
import { useT } from '@/hooks/use-t';
import { PYTHON_API_URL } from '@/lib/api-url';
import { baseCode } from '@langplayer/utils';
import { ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';
import { User, Mail, Clock, BookOpen, Crown, Play, Star, CreditCard, ArrowRight } from 'lucide-react-native';

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, margin: 16, marginBottom: 32 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: '#0f172a' },
  email: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  emailText: { fontSize: 13, color: '#64748b' },
  section: { marginHorizontal: 16, marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#0f172a', flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  card: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, backgroundColor: '#fff', padding: 16 },
  cardText: { fontSize: 14, color: '#64748b' },
  pill: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 4, alignSelf: 'flex-start' },
  pillGreen: { backgroundColor: '#dcfce7' },
  pillText: { fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  historyItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  thumb: { width: 80, height: 48, borderRadius: 6, backgroundColor: '#e2e8f0' },
  historyTitle: { fontSize: 13, fontWeight: '500', color: '#0f172a', flex: 1 },
  historyMeta: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  wordRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  word: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  wordMeta: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  linkText: { fontSize: 13, color: '#3b82f6' },
  emptyText: { paddingVertical: 24, textAlign: 'center', fontSize: 14, color: '#94a3b8' },
});

function youtubeThumb(id: string) { return `https://img.youtube.com/vi/${id}/mqdefault.jpg`; }
function formatDuration(d: number | undefined): string {
  if (!d) return '';
  const m = Math.floor(d / 60), s = Math.floor(d % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface WatchHistoryItem { id: number; title?: string; youtube_id: string; duration?: number; last_position?: number; }

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { l1Lang, l2Lang } = useLanguage();
  const { savedWords: allSaved } = useSavedWords();
  const router = useRouter();
  const t = useT();

  const l2Code = baseCode(l2Lang.code);
  const savedWords = (allSaved[l2Lang.code] ?? []).slice(0, 5);

  const displayName = user?.firstName || user?.lastName
    ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
    : t('label.unknown_user');

  // Watch history
  const [history, setHistory] = useState<WatchHistoryItem[]>([]);
  const [histLoading, setHistLoading] = useState(true);
  useEffect(() => {
    if (!user?.id) { setHistLoading(false); return; }
    fetch(`${PYTHON_API_URL}/user-watch-history`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user.id, l2: l2Code }),
    })
      .then((r) => r.ok ? r.json() : [])
      .then((d: WatchHistoryItem[]) => {
        const seen = new Set<string>();
        setHistory((Array.isArray(d) ? d : []).filter((i) => seen.has(i.youtube_id) ? false : (seen.add(i.youtube_id), true)).slice(0, 5));
      })
      .catch(() => {}).finally(() => setHistLoading(false));
  }, [user?.id, l2Code]);

  if (!user) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', padding: 24 }}>
        <Text style={{ textAlign: 'center', fontSize: 14, color: '#64748b' }}>{t('label.guest')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={S.root}>
      {/* Account */}
      <View style={S.header}>
        <View style={S.avatar}><User size={28} color="#3b82f6" /></View>
        <View style={{ flex: 1 }}>
          <Text style={S.title}>{displayName}</Text>
          <View style={S.email}><Mail size={14} color="#94a3b8" /><Text style={S.emailText}>{user.email}</Text></View>
        </View>
      </View>

      {/* Language Level */}
      <View style={S.section}>
        <Text style={S.sectionTitle}><BookOpen size={18} color={ICON_PRIMARY} /> {t('title.settings')}</Text>
        <View style={S.card}>
          <Text style={S.cardText}>{t('msg.set_level_for_recommendations', { l2: l2Lang.name })}</Text>
        </View>
      </View>

      {/* Watch History */}
      <View style={S.section}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={S.sectionTitle}><Clock size={18} color={ICON_PRIMARY} /> {t('title.watch_history')}</Text>
          {history.length > 0 && (
            <Pressable onPress={() => router.push('/(tabs)/(media)/watch-history' as any)} style={S.link}>
              <Text style={S.linkText}>{t('action.see_all')}</Text>
              <ArrowRight size={12} color="#3b82f6" />
            </Pressable>
          )}
        </View>
        {histLoading ? <ActivityIndicator size="small" color={ICON_MUTED} /> :
         history.length === 0 ? <Text style={S.emptyText}>{t('msg.no_videos_watched')}</Text> :
         history.map((item) => (
           <Pressable key={item.id} onPress={() => router.push(`/(tabs)/(media)/watch/${item.youtube_id}` as any)} style={S.historyItem}>
             <Image source={{ uri: youtubeThumb(item.youtube_id) }} style={S.thumb} />
             <View style={{ flex: 1 }}>
               <Text style={S.historyTitle} numberOfLines={2}>{item.title ?? t('label.untitled_video')}</Text>
               {item.duration ? <Text style={S.historyMeta}>{formatDuration(item.duration)}</Text> : null}
             </View>
             <Play size={14} color="#94a3b8" />
           </Pressable>
         ))}
      </View>

      {/* Saved Words */}
      <View style={S.section}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={S.sectionTitle}><BookOpen size={18} color={ICON_PRIMARY} /> {t('title.saved_words')}</Text>
          {savedWords.length > 0 && (
            <Pressable onPress={() => router.push('/(tabs)/(vocab)/saved-words' as any)} style={S.link}>
              <Text style={S.linkText}>{t('action.see_all')}</Text>
              <ArrowRight size={12} color="#3b82f6" />
            </Pressable>
          )}
        </View>
        {savedWords.length === 0 ? <Text style={S.emptyText}>{t('msg.no_words_saved')}</Text> :
         savedWords.map((w) => (
           <Pressable key={w.id} onPress={() => router.push(`/(tabs)/(vocab)/word/${(w.id).replace(/,/g, '~')}` as any)} style={S.wordRow}>
             <View style={{ flex: 1 }}>
               <Text style={S.word}>{(w as any).head || (w as any).forms?.[0] || w.id}</Text>
               {(w as any).context?.videoTitle ? <Text style={S.wordMeta} numberOfLines={1}>📺 {(w as any).context.videoTitle}</Text> : null}
             </View>
           </Pressable>
         ))}
      </View>

      {/* Subscription */}
      <View style={S.section}>
        <Text style={S.sectionTitle}><Star size={18} color="#f59e0b" /> {t('title.subscription')}</Text>
        <View style={S.card}>
          <View style={S.pill}><Text style={S.pillText}>Free</Text></View>
          <Pressable onPress={() => router.push('/(tabs)/(me)/go-pro' as any)} style={[S.link, { marginTop: 12 }]}>
            <Text style={S.linkText}>{t('action.upgrade_to_pro')}</Text>
            <ArrowRight size={12} color="#3b82f6" />
          </Pressable>
        </View>
      </View>

      {/* Logout */}
      <Pressable onPress={logout} style={{ marginHorizontal: 16, marginBottom: 32, paddingVertical: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#e2e8f0' }}>
        <Text style={{ fontSize: 14, color: '#dc2626' }}>{t('action.logout')}</Text>
      </Pressable>
    </ScrollView>
  );
}
