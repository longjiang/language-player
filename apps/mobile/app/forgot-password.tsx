import { useState } from 'react';
import { View, Text, ActivityIndicator, Keyboard } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { router } from 'expo-router';
import { PLACEHOLDER_COLOR } from '@/lib/theme-colors';
import { ICON_ON_PRIMARY } from '@/lib/theme-colors';
import { useT } from '@/hooks/use-t';
import { PYTHON_API_URL } from '@/lib/api-url';
import { e2e } from '@/lib/e2e';
import { AuthContainer } from '@/components/layout/AuthContainer';

export default function ForgotPasswordScreen() {
  const t = useT();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleRequestReset = async () => {
    Keyboard.dismiss();
    setError(null);
    setLoading(true);
    try {
      await fetch(`${PYTHON_API_URL}/auth/password-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      // Always show success to prevent email enumeration
      setSent(true);
    } catch {
      // Show success anyway for security
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthContainer>
        <View className="rounded-2xl border border-border bg-card p-8 items-center">
          <Text className="text-5xl mb-4">📧</Text>
          <Text className="text-2xl font-bold text-foreground text-center">
            {t('title.check_email')}
          </Text>
          <Text className="text-muted-foreground text-sm text-center mt-2">
            {t('msg.password_reset_sent', { email })}
          </Text>
          <Button
            className="mt-6"
            variant="outline"
            onPress={() => router.back()}
            {...e2e('forgot-back-to-login-button')}
          >
            <Text className="text-foreground font-medium text-sm">
              {t('action.back_to_login')}
            </Text>
          </Button>
        </View>
      </AuthContainer>
    );
  }

  return (
    <AuthContainer>
      <Pressable
        onPress={() => Keyboard.dismiss()}
        {...e2e('dismiss-keyboard')}
      >
        <Text className="text-3xl font-bold text-foreground mb-2 text-center">
          {t('title.reset_password')}
        </Text>
        <Text className="text-muted-foreground text-sm text-center mb-8">
          {t('msg.enter_email_for_reset')}
        </Text>
      </Pressable>

      {error && (
        <Text className="text-destructive text-sm mb-4 text-center">{error}</Text>
      )}

      <Input
        className="bg-card border border-border rounded-lg px-4 py-3 text-foreground mb-6"
        placeholder={t('placeholder.email')}
        placeholderTextColor={PLACEHOLDER_COLOR}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        {...e2e('forgot-email-input')}
      />

      <Button
        className="mb-3"
        onPress={handleRequestReset}
        disabled={loading}
        {...e2e('forgot-send-button')}
      >
        {loading ? (
          <ActivityIndicator color={ICON_ON_PRIMARY} />
        ) : (
          <Text className="text-primary-foreground font-bold text-base">
            {t('action.send_reset_link')}
          </Text>
        )}
      </Button>

      <Pressable onPress={() => router.back()}>
        <Text className="text-primary text-center text-sm">
          {t('action.back_to_login')}
        </Text>
      </Pressable>
    </AuthContainer>
  );
}
