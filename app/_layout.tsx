// @/app/_layout.tsx
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "@expo-google-fonts/nunito";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import "react-native-reanimated";
import { Platform } from "react-native";
import { useColorScheme } from "@/hooks/useColorScheme";
import { VideoPlayerProvider } from "@/contexts/VideoPlayerContext";
import { MiniPlayer } from "@/components/MiniPlayer";
import { useNavigation } from "expo-router";
import { useRoute } from "@react-navigation/native";
import { DictionaryProvider } from "@/contexts/DictionaryContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from '@/contexts/AuthContext';
import { SettingsProvider } from '@/contexts/SettingsContext';
import { Audio } from "expo-av";

const soundObject = new Audio.Sound();

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  const navigation = useNavigation();

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  useEffect(() => {
    const enableSound = async () => {
      if (Platform.OS === "ios") {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
        });
        await soundObject.loadAsync(require("@/assets/soundFile.mp3"));
        await soundObject.playAsync();
      }
    };
    enableSound();
  });

  if (!loaded) {
    return null;
  }

  return (
    <AuthProvider>
      <SettingsProvider>
        <LanguageProvider>
          <DictionaryProvider>
            <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
              <VideoPlayerProvider>
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
                  <Stack.Screen name="test" options={{ headerShown: false }} />
                  <Stack.Screen
                    name="video/youtube/[youtube_id]"
                    options={{ headerShown: false, presentation: "modal" }}
                  />
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="+not-found" />
                </Stack>
                <MiniPlayer />
              </VideoPlayerProvider>
            </ThemeProvider>
          </DictionaryProvider>
        </LanguageProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}
