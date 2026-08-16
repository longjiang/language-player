import { useState, useEffect } from 'react';
import { View, Text, TextInput, ActivityIndicator } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { router, useLocalSearchParams } from 'expo-router';
import { PLACEHOLDER_COLOR, ICON_ON_PRIMARY } from '@/lib/theme-colors';
import { useT } from '@/hooks/use-t';
import { localizedError } from '@/lib/errors';
import { PYTHON_API_URL } from '@/lib/api-url';
import { e2e } from '@/lib/e2e';
import { AuthContainer } from '@/components/layout/AuthContainer';

export default function PasswordResetScreen() {
  const t = useT();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError(t('error.invalid_reset_link') || 'Invalid reset link');
    }
  }, [token, t]);

  const handleReset = async () => {
    setError(null);

    if (!token) {
      setError(t('error.invalid_reset_link') || 'Invalid reset link');
      return;
    }

    if (password.length < 8) {
      setError(t('error.password_too_short') || 'Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError(t('error.passwords_do_not_match'));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${PYTHON_API_URL}/auth/password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim(), password }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.errors?.[0]?.message || t('error.password_reset') || 'Failed to reset password');
      }

      setSuccess(true);
    } catch (e: any) {
      setError(localizedError(t, e, 'error.password_reset'));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <AuthContainer>
        <View className="rounded-2xl border border-border bg-card p-8 items-center">
          <Text className="text-5xl mb-4">✅</Text>
          <Text className="text-2xl font-bold text-foreground text-center">
            {t('title.reset_password')}
          </Text>
          <Text className="text-muted-foreground text-sm text-center mt-2">
            {t('msg.reset_password_success')}
          </Text>
          <Pressable
            className="mt-6 bg-primary px-6 py-3 rounded-lg"
            onPress={() => router.replace('/login')}
            {...e2e('reset-back-to-login-button')}
          >
            <Text className="text-primary-foreground font-medium text-sm">
              {t('action.back_to_login')}
            </Text>
          </Pressable>
        </View>
      </AuthContainer>
    );
  }

  return (
    <AuthContainer>
      <Text className="text-3xl font-bold text-foreground mb-2 text-center">
        {t('title.reset_password')}
      </Text>
      <Text className="text-muted-foreground text-sm text-center mb-8">
        {t('placeholder.password_min')}
      </Text>

      {error && (
        <Text className="text-destructive text-sm mb-4 text-center">{error}</Text>
      )}

      <TextInput
        className="bg-card border border-border rounded-lg px-4 py-3 text-foreground mb-3"
        placeholder={t('placeholder.password')}
        placeholderTextColor={PLACEHOLDER_COLOR}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        {...e2e('reset-password-input')}
      />

      <TextInput
        className="bg-card border border-border rounded-lg px-4 py-3 text-foreground mb-6"
        placeholder={t('placeholder.confirm_password')}
        placeholderTextColor={PLACEHOLDER_COLOR}
        secureTextEntry
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        {...e2e('reset-confirm-password-input')}
      />

      <Pressable
        className="bg-primary py-3 rounded-lg items-center mb-3"
        onPress={handleReset}
        disabled={loading || !token}
        {...e2e('reset-confirm-button')}
      >
        {loading ? (
          <ActivityIndicator color={ICON_ON_PRIMARY} />
        ) : (
          <Text className="text-primary-foreground font-bold text-base">
            {t('action.confirm')}
          </Text>
        )}
      </Pressable>

      <Pressable onPress={() => router.replace('/login')}>
        <Text className="text-primary text-center text-sm">
          {t('action.back_to_login')}
        </Text>
      </Pressable>
    </AuthContainer>
  );
}
