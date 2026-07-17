// @/app/_layout.tsx
import { useFonts, Nunito_400Regular, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { useColorScheme } from "@/hooks/useColorScheme";
import { VideoPlayerProvider } from "@/contexts/VideoPlayerContext";
import { DictionaryProvider } from "@/contexts/DictionaryContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from '@/contexts/AuthContext';
import { SettingsProvider } from '@/contexts/SettingsContext';
import { Audio } from "expo-av";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { UserDataProvider } from '@/contexts/UserDataContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { useSoundEffect } from "@/hooks/useSoundEffect";
import { TVShowsProvider } from "@/contexts/TVShowsContext";
import { StatusBar } from 'expo-status-bar';

const soundObject = new Audio.Sound();

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    Nunito_400Regular, Nunito_800ExtraBold
  });

  useSoundEffect();

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <LanguageProvider>
      <AuthProvider>
        <SubscriptionProvider>
          <UserDataProvider>
            <SettingsProvider>
                <DictionaryProvider>
                  <ThemeProvider>
                    <TVShowsProvider>
                      <VideoPlayerProvider>
                        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
                        <Stack>
                          <Stack.Screen name="index" options={{ headerShown: false }} />
                          <Stack.Screen name="login" options={{ headerShown: false }} />
                          <Stack.Screen name="register" options={{ headerShown: false }} />
                          <Stack.Screen name="verify-email" options={{ headerShown: false }} />
                          <Stack.Screen
                            name="acquisition-survey"
                            options={{ headerShown: false }}
                          />
                          <Stack.Screen name="select-l2" options={{ headerShown: false }} />
                          <Stack.Screen name="select-l1" options={{ headerShown: false }} />
                          <Stack.Screen name="select-level" options={{ headerShown: false }} />
                          <Stack.Screen name="account" options={{ headerShown: false }} />
                          <Stack.Screen name="go-pro" options={{ headerShown: false }} />
                          <Stack.Screen name="delete-account" options={{ headerShown: false }} />
                          <Stack.Screen name="privacy-policy" options={{ headerShown: false }} />
                          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                          <Stack.Screen name="+not-found" />
                          <Stack.Screen name="settings" options={{ headerShown: false, presentation: "modal" }} />
                        </Stack>
                      </VideoPlayerProvider>
                    </TVShowsProvider>
                  </ThemeProvider>
                </DictionaryProvider>
            </SettingsProvider>
          </UserDataProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
