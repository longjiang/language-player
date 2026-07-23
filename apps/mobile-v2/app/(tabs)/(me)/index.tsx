import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';
import { User, LogOut, Settings, BookOpen, Info, LogIn, Star } from 'lucide-react-native';

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '700', color: '#3b82f6' },
  userName: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  userEmail: { fontSize: 13, color: '#64748b', marginTop: 2 },
  langRow: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  divider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 20 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  menuLabel: { flex: 1, fontSize: 14, color: '#0f172a' },
  destructiveLabel: { color: '#dc2626' },
});

export default function MeScreen() {
  const { user, logout } = useAuth();
  const { l1Lang, l2Lang } = useLanguage();
  const router = useRouter();
  const t = useT();

  const initial = user?.name?.charAt(0)?.toUpperCase() ?? user?.email?.charAt(0)?.toUpperCase() ?? '?';

  return (
    <View style={S.root}>
      {/* Header — tap to go to profile (matching Next.js) */}
      <Pressable onPress={() => router.push('/(tabs)/(me)/profile' as any)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={S.avatar}>
          <Text style={S.avatarText}>{initial}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={S.userName}>{user?.name ?? user?.email ?? t('label.guest')}</Text>
          {user?.email && <Text style={S.userEmail}>{user.email}</Text>}
          <Text style={S.langRow}>{l1Lang.name} → {l2Lang.name}</Text>
        </View>
      </Pressable>

      <View style={S.divider} />

      {/* Menu items — matches Next.js user-menu exactly */}
      <Pressable onPress={() => router.push('/(tabs)/(me)/settings' as any)} style={S.menuItem}>
        <Settings size={20} color={ICON_MUTED} />
        <Text style={S.menuLabel}>{t('title.settings')}</Text>
      </Pressable>

      <Pressable onPress={() => router.push('/(tabs)/(vocab)/saved-words' as any)} style={S.menuItem}>
        <Star size={20} color={ICON_MUTED} />
        <Text style={S.menuLabel}>{t('title.saved_words')}</Text>
      </Pressable>

      <Pressable onPress={() => router.push('/(tabs)/(me)/docs' as any)} style={S.menuItem}>
        <BookOpen size={20} color={ICON_MUTED} />
        <Text style={S.menuLabel}>{t('title.docs')}</Text>
      </Pressable>

      <Pressable onPress={() => router.push('/(tabs)/(me)/about' as any)} style={S.menuItem}>
        <Info size={20} color={ICON_MUTED} />
        <Text style={S.menuLabel}>{t('title.about')}</Text>
      </Pressable>

      <View style={S.divider} />

      {user ? (
        <Pressable onPress={logout} style={S.menuItem}>
          <LogOut size={20} color="#dc2626" />
          <Text style={[S.menuLabel, S.destructiveLabel]}>{t('action.logout')}</Text>
        </Pressable>
      ) : (
        <Pressable onPress={() => router.push('/login' as any)} style={S.menuItem}>
          <LogIn size={20} color={ICON_PRIMARY} />
          <Text style={{ fontSize: 14, color: '#3b82f6' }}>{t('action.log_in')}</Text>
        </Pressable>
      )}
    </View>
  );
}
