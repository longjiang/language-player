import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { IntlProviderWrapper } from '@/contexts/IntlProvider';
import { AuthProvider } from '@/contexts/AuthContext';
import '../global.css';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <LanguageProvider>
      <IntlProviderWrapper>
        <AuthProvider>
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="login" options={{ presentation: 'modal' }} />
            <Stack.Screen name="register" options={{ presentation: 'modal' }} />
            <Stack.Screen name="select-l1" options={{ presentation: 'modal' }} />
            <Stack.Screen name="select-l2" options={{ presentation: 'modal' }} />
          </Stack>
        </AuthProvider>
      </IntlProviderWrapper>
    </LanguageProvider>
  );
}
