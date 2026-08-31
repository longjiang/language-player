import { useState } from 'react';
import { View, Text, ActivityIndicator, Keyboard } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { Button, buttonTextClass } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getUserSettings } from '@langplayer/api-client';
import { ICON_ON_PRIMARY } from '@/lib/theme-colors';
import { useT } from '@/hooks/use-t';
import { localizedError } from '@/lib/errors';
import { PLACEHOLDER_COLOR } from '@/lib/theme-colors';
import { e2e } from '@/lib/e2e';
import { AuthContainer } from '@/components/layout/AuthContainer';
import { OfflineModeNotice } from '@/components/auth/OfflineModeNotice';

export default function LoginScreen() {
  const t = useT();
  const { login } = useAuth();
  const { hasStoredPair, setL1Lang, setL2Lang } = useLanguage();
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
      // Immediately after login, restore the last-used L1/L2 pair across
      // devices (recorded in the cloud settings). If the learner has never
      // used the app there is no recorded pair → fall back to a stored local
      // pair, else the select-language flow.
      let restoredPair = false;
      try {
        const res = await getUserSettings();
        const pair = res?.settings_v2?.languagePair;
        if (pair?.l1 && pair?.l2) {
          await setL1Lang(pair.l1);
          await setL2Lang(pair.l2);
          restoredPair = true;
        }
      } catch {
        restoredPair = false;
      }
      if (restoredPair || hasStoredPair) {
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
      setError(localizedError(t, e, 'error.login'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContainer>
      <Pressable
        onPress={() => Keyboard.dismiss()}
        {...e2e('dismiss-keyboard')}
      >
        <Text className="text-3xl font-bold text-foreground mb-8 text-center">
          Language Player
        </Text>
      </Pressable>

      <OfflineModeNotice />

      {error && (
        <Text className="text-destructive text-sm mb-4 text-center">{error}</Text>
      )}

      <Input
        className="mb-3"
        placeholder={t('placeholder.email')}
        placeholderTextColor={PLACEHOLDER_COLOR}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        {...e2e('login-email-input')}
      />
      <Input
        className="mb-3"
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

      <Button
        className="mb-3"
        onPress={handleLogin}
        disabled={loading}
        {...e2e('login-signin-button')}
      >
        {loading ? (
          <ActivityIndicator color={ICON_ON_PRIMARY} />
        ) : (
          <Text className={buttonTextClass('default')}>
            {t('action.login')}
          </Text>
        )}
      </Button>

      <Pressable onPress={() => { Keyboard.dismiss(); router.push('/register'); }}>
        <Text className="text-primary text-center text-sm">
          {t('msg.dont_have_account')}
        </Text>
      </Pressable>
    </AuthContainer>
  );
}
