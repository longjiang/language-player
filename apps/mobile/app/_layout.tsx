// Intl polyfills for Hermes (Intl.PluralRules) — MUST be first
import '@/lib/intl-polyfills';

import React from 'react';
import { Stack } from 'expo-router';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PortalHost } from '@rn-primitives/portal';
import Toast, { InfoToast, type ToastConfigParams } from 'react-native-toast-message';

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
    Consumes custom props: { quality, label: { label, hint }, handleUndo, undoLabel }
    Styled to match the web review page: colored background, Undo button trailing.
  */
  info: (params: ToastConfigParams<{ quality?: string; label?: { label: string; hint: string }; handleUndo?: () => void; undoLabel?: string }>) => {
    const { quality, label, handleUndo, undoLabel } = params.props ?? {};
    const bgColor = TOAST_BG_COLORS[quality ?? ''] ?? '#16a34a';
    const borderColor = TOAST_BORDER_COLORS[quality ?? ''] ?? '#15803d';
    return (
      <InfoToast
        text1={label?.label}
        text2={label?.hint}
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
            className="mr-3 rounded-lg border border-white/60 px-4 py-1.5"
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
import { ThemeProvider } from '@/contexts/ThemeContext';
import { DictionaryProvider } from '@/contexts/DictionaryContext';
import { VideoPlayerProvider } from '@/contexts/VideoPlayerContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import '../global.css';

// ── Error Boundary to surface full stack traces to Metro ──

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ROOT ERROR BOUNDARY]', error.message, '\n', error.stack, '\nComponent stack:', info.componentStack);
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

  return (
    <ErrorBoundary>
    <LanguageProvider>
      <IntlProviderWrapper>
        <AuthProvider>
          <UserDataProvider>
            <SettingsProvider>
              <ThemeProvider>
                <DictionaryProvider>
                  <VideoPlayerProvider>
                    <SubscriptionProvider>
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
                    </SubscriptionProvider>
                  </VideoPlayerProvider>
                </DictionaryProvider>
              </ThemeProvider>
            </SettingsProvider>
          </UserDataProvider>
        </AuthProvider>
      </IntlProviderWrapper>
    </LanguageProvider>
    </ErrorBoundary>
  );
}
