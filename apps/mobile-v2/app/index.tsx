import { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { router, SplashScreen } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

// Keep the splash screen visible while we check auth state
SplashScreen.preventAutoHideAsync();

export default function Index() {
  const { user, loading: authLoading } = useAuth();
  const { l1Lang, l2Lang } = useLanguage();

  useEffect(() => {
    if (!authLoading) {
      SplashScreen.hideAsync();
    }
  }, [authLoading]);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      // Not authenticated → show login
      router.replace('/login');
    } else {
      // Authenticated → show main tabs
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace('/(tabs)' as any);
    }
  }, [user, authLoading]);

  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="text-2xl font-bold text-foreground mb-4">Language Player</Text>
      <ActivityIndicator size="large" className="text-primary" />
    </View>
  );
}
