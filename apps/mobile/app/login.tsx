import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Keyboard } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ICON_ON_PRIMARY } from '@/lib/theme-colors';
import { useT } from '@/hooks/use-t';
import { PLACEHOLDER_COLOR } from '@/lib/theme-colors';
import { e2e } from '@/lib/e2e';

export default function LoginScreen() {
  const t = useT();
  const { login } = useAuth();
  const { hasStoredPair } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    Keyboard.dismiss();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      if (hasStoredPair) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.replace('/(tabs)/(media)' as any);
      } else {
        router.replace('/select-language');
      }
    } catch (e: any) {
      if (e?.code === 'email_not_confirmed') {
        router.replace(`/verify-email?email=${encodeURIComponent(email.trim())}`);
        return;
      }
      setError(e.message || t('error.login'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 justify-center bg-background p-6">
      <Pressable
        onPress={() => Keyboard.dismiss()}
        {...e2e('dismiss-keyboard')}
      >
        <Text className="text-3xl font-bold text-foreground mb-8 text-center">
          Language Player
        </Text>
      </Pressable>

      {error && (
        <Text className="text-destructive text-sm mb-4 text-center">{error}</Text>
      )}

      <TextInput
        className="bg-card border border-border rounded-lg px-4 py-3 text-foreground mb-3"
        placeholder={t('placeholder.email')}
        placeholderTextColor={PLACEHOLDER_COLOR}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        {...e2e('login-email-input')}
      />
      <TextInput
        className="bg-card border border-border rounded-lg px-4 py-3 text-foreground mb-3"
        placeholder={t('placeholder.password')}
        placeholderTextColor={PLACEHOLDER_COLOR}
        secureTextEntry
        textContentType="none"
        autoComplete="off"
        value={password}
        onChangeText={setPassword}
        {...e2e('login-password-input')}
      />

      <Pressable
        className="mb-6 self-end"
        onPress={() => router.push('/forgot-password')}
      >
        <Text className="text-primary text-sm">
          {t('action.forgot_password')}
        </Text>
      </Pressable>

      <Pressable
        className="bg-primary py-3 rounded-lg items-center mb-3"
        onPress={handleLogin}
        disabled={loading}
        {...e2e('login-signin-button')}
      >
        {loading ? (
          <ActivityIndicator color={ICON_ON_PRIMARY} />
        ) : (
          <Text className="text-primary-foreground font-bold text-base">
            {t('action.login')}
          </Text>
        )}
      </Pressable>

      <Pressable onPress={() => { Keyboard.dismiss(); router.push('/register'); }}>
        <Text className="text-primary text-center text-sm">
          {t('msg.dont_have_account')}
        </Text>
      </Pressable>
    </View>
  );
}
