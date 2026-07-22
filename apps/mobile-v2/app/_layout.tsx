import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { IntlProviderWrapper } from '@/contexts/IntlProvider';
import { AuthProvider } from '@/contexts/AuthContext';
import { UserDataProvider } from '@/contexts/UserDataContext';
import { SettingsProvider } from '@/contexts/SettingsContext';
import { DictionaryProvider } from '@/contexts/DictionaryContext';
import { VideoPlayerProvider } from '@/contexts/VideoPlayerContext';
import '../global.css';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <LanguageProvider>
      <IntlProviderWrapper>
        <AuthProvider>
          <UserDataProvider>
            <SettingsProvider>
              <DictionaryProvider>
                <VideoPlayerProvider>
                  <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index" />
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="login" options={{ presentation: 'modal' }} />
                    <Stack.Screen name="register" options={{ presentation: 'modal' }} />
                    <Stack.Screen name="select-l1" options={{ presentation: 'modal' }} />
                    <Stack.Screen name="select-l2" options={{ presentation: 'modal' }} />
                  </Stack>
                </VideoPlayerProvider>
              </DictionaryProvider>
            </SettingsProvider>
          </UserDataProvider>
        </AuthProvider>
      </IntlProviderWrapper>
    </LanguageProvider>
  );
}
