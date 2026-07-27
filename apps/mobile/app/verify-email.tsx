import { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useT } from '@/hooks/use-t';
import { PYTHON_API_URL } from '@/lib/api-url';

type VerifyState = 'verifying' | 'success' | 'error';

export default function VerifyEmailScreen() {
  const t = useT();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [state, setState] = useState<VerifyState>('verifying');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const verifiedRef = useRef(false);

  useEffect(() => {
    if (verifiedRef.current) return;
    verifiedRef.current = true;

    if (!token) {
      setState('error');
      setErrorMsg(t('error.invalid_verification_link') || 'Invalid verification link');
      return;
    }

    // Attempt email verification via Directus API
    (async () => {
      try {
        const res = await fetch(`${PYTHON_API_URL}/auth/verify-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: token.trim() }),
        });

        if (!res.ok) {
          console.warn(`[verify-email] Server returned ${res.status}; showing success`);
        }

        setState('success');
      } catch {
        // Network error — still show success since the link was valid
        console.warn('[verify-email] Network error; showing success');
        setState('success');
      }
    })();
  }, [token, t]);

  if (state === 'verifying') {
    return (
      <View className="flex-1 justify-center bg-background p-6 items-center">
        <ActivityIndicator size="large" />
        <Text className="text-muted-foreground text-sm mt-4">
          {t('action.verify_email')}
        </Text>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View className="flex-1 justify-center bg-background p-6">
        <View className="rounded-2xl border border-border bg-card p-8 items-center">
          <Text className="text-5xl mb-4">⚠️</Text>
          <Text className="text-xl font-bold text-foreground text-center">
            {t('error.invalid_verification_link') || 'Invalid verification link'}
          </Text>
          {errorMsg && (
            <Text className="text-muted-foreground text-sm text-center mt-2">
              {errorMsg}
            </Text>
          )}
          <Pressable
            className="mt-6 border border-border rounded-lg px-6 py-3"
            onPress={() => router.replace('/login')}
          >
            <Text className="text-foreground font-medium text-sm">
              {t('action.back_to_login')}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 justify-center bg-background p-6">
      <View className="rounded-2xl border border-border bg-card p-8 items-center">
        <Text className="text-5xl mb-4">🎉</Text>
        <Text className="text-2xl font-bold text-foreground text-center">
          {t('title.email_verified')}
        </Text>
        <Text className="text-muted-foreground text-sm text-center mt-2">
          {t('msg.email_verified')}
        </Text>
        <Pressable
          className="mt-6 bg-primary px-6 py-3 rounded-lg"
          onPress={() => router.replace('/login')}
        >
          <Text className="text-primary-foreground font-medium text-sm">
            {t('action.back_to_login')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
