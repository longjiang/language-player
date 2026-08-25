// Intl polyfills for Hermes (Intl.PluralRules) — MUST be first
import '@/lib/intl-polyfills';

import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { View, Text, ScrollView, LogBox } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PortalHost } from '@rn-primitives/portal';
import Toast, { InfoToast, type ToastConfigParams } from 'react-native-toast-message';
import { logerr } from '@/lib/logger';
import { useAppFonts } from '@/lib/fonts';
import { initOfflineMode } from '@/lib/offline-mode';
import { TokenizationWorkerHost } from '@/components/TokenizationWorkerHost';
import { mapWebUrlToAppRoute } from '@/lib/web-url-mapper';
import { startFileOpenListener } from '@/lib/file-open';

// ── Custom toast config ──

const TOAST_BG_COLORS: Record<string, string> = {
  again: '#dc2626',
  hard: '#f97316',
  good: '#16a34a',
  easy: '#2563eb',
};

const TOAST_BORDER_COLORS: Record<string, string> = {
  again: '#b91c1c',
  hard: '#ea580c',
  good: '#15803d',
  easy: '#1d4ed8',
};

const toastConfig = {
  /*
    Info toast with Undo button for rating feedback.
    Consumes custom props: { quality, label: { label, hint }, nextReviewLabel, handleUndo, undoLabel }
    Styled to match the web review page: colored background, Undo button trailing.
  */
  info: (params: ToastConfigParams<{ quality?: string; label?: { label: string; hint: string }; nextReviewLabel?: string; handleUndo?: () => void; undoLabel?: string }>) => {
    const { quality, label, nextReviewLabel, handleUndo, undoLabel } = params.props ?? {};
    const bgColor = TOAST_BG_COLORS[quality ?? ''] ?? '#16a34a';
    const borderColor = TOAST_BORDER_COLORS[quality ?? ''] ?? '#15803d';
    return (
      <InfoToast
        text1={label?.label}
        text2={nextReviewLabel ?? label?.hint}
        onPress={params.onPress}
        style={{
          borderLeftColor: borderColor,
          backgroundColor: bgColor,
          borderRadius: 12,
        }}
        text1Style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}
        text2Style={{ color: '#ffffffcc', fontSize: 12 }}
        renderTrailingIcon={() => handleUndo ? (
          <Pressable
            onPress={handleUndo}
            className="mr-4 my-2.5 items-center justify-center rounded-md border border-white/60 px-3"
          >
            <Text className="text-sm font-medium text-white">{undoLabel ?? 'Undo'}</Text>
          </Pressable>
        ) : null}
      />
    );
  },
};

import { LanguageProvider } from '@/contexts/LanguageContext';
import { IntlProviderWrapper } from '@/contexts/IntlProvider';
import { AuthProvider } from '@/contexts/AuthContext';
import { UserDataProvider } from '@/contexts/UserDataContext';
import { SettingsProvider } from '@/contexts/SettingsContext';
import { SyncStatusProvider } from '@/contexts/SyncStatusContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { DictionaryProvider } from '@/contexts/DictionaryContext';
import { SavedWordsProvider } from '@/contexts/SavedWordsContext';
import { VideoPlayerProvider } from '@/contexts/VideoPlayerContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { UserLibraryProvider } from '@/contexts/UserLibraryContext';
import '../global.css';

// Suppress all on-screen LogBox notifications. This is intentional for store
// screenshot capture (SPEC-070) — remove this line when you need warnings/
// errors visible during development.
LogBox.ignoreAllLogs();

// ── Error Boundary to surface full stack traces to Metro ──

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logerr('[ROOT ERROR BOUNDARY]', error.message, '\n', error.stack, '\nComponent stack:', info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View className="flex-1 items-center justify-center bg-background p-4">
          <Text className="mb-2 text-lg font-bold text-destructive">App Error</Text>
          <ScrollView className="max-h-80 w-full rounded-lg border border-border bg-card p-3">
            <Text className="text-xs text-foreground font-mono">{this.state.error.message}</Text>
            <Text className="mt-2 text-xs text-muted-foreground font-mono">{this.state.error.stack}</Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  const insets = useSafeAreaInsets();
  const [fontsLoaded, fontError] = useAppFonts();
  const [offlineModeReady, setOfflineModeReady] = useState(false);

  // Install the network gate before any provider mounts so Offline Mode is
  // active from the very first app request (including auth/settings sync).
  useEffect(() => {
    void initOfflineMode().finally(() => setOfflineModeReady(true));
  }, []);

  // Web → app links (SPEC-069): translate https://languageplayer.io/... URLs
  // into internal routes. Runs only after fonts/offline-mode are ready so the
  // provider tree is mounted before we navigate.
  useEffect(() => {
    if ((!fontsLoaded && !fontError) || !offlineModeReady) return;

    const handleUrl = (raw: string | null) => {
      if (!raw) return;
      const mapped = mapWebUrlToAppRoute(raw);
      if (mapped) {
        router.replace({
          pathname: mapped.pathname as any,
          params: mapped.params,
        } as any);
      }
    };

    void Linking.getInitialURL().then(handleUrl);
    const subscription = Linking.addEventListener('url', (event) => {
      handleUrl(event.url);
    });
    return () => subscription.remove();
  }, [fontsLoaded, fontError, offlineModeReady]);

  // OS file open (iOS "Open in…" / Android VIEW intent) → route to the right
  // reader (file handling feature). Starts immediately; copies + classifies
  // file/content URIs and lets the target screens consume them on focus.
  useEffect(() => {
    const stop = startFileOpenListener();
    return stop;
  }, []);

  // Keep the splash visible (and skip the first render) until the vendored
  // Inter fonts are ready. On failure, render with system fonts instead.
  if ((!fontsLoaded && !fontError) || !offlineModeReady) {
    return null;
  }

  return (
    <ErrorBoundary>
    <GestureHandlerRootView style={{ flex: 1 }}>
    <LanguageProvider>
      <IntlProviderWrapper>
        <AuthProvider>
          <UserDataProvider>
            <SettingsProvider>
              <SyncStatusProvider>
              <ThemeProvider>
                <DictionaryProvider>
                  <SavedWordsProvider>
                    <VideoPlayerProvider>
                      <SubscriptionProvider>
                      <UserLibraryProvider>
                      <Stack screenOptions={{ headerShown: false }}>
                        <Stack.Screen name="index" />
                        <Stack.Screen name="(tabs)" />
                        <Stack.Screen name="login" options={{ presentation: 'modal' }} />
                        <Stack.Screen name="register" options={{ presentation: 'modal' }} />
                        <Stack.Screen name="select-language" options={{ presentation: 'modal' }} />
                        <Stack.Screen name="go-pro-error" />
                        <Stack.Screen name="go-pro-success" />
                      </Stack>
                      <PortalHost />
                      <Toast config={toastConfig} topOffset={insets.top + 8} />
                      <TokenizationWorkerHost />
                      </UserLibraryProvider>
                      </SubscriptionProvider>
                    </VideoPlayerProvider>
                  </SavedWordsProvider>
                </DictionaryProvider>
              </ThemeProvider>
              </SyncStatusProvider>
            </SettingsProvider>
          </UserDataProvider>
        </AuthProvider>
      </IntlProviderWrapper>
    </LanguageProvider>
    </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
