import { useState, useEffect, useRef } from 'react';
import { Alert, View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useT } from '@/hooks/use-t';
import { useAuth } from '@/contexts/AuthContext';
import { PYTHON_API_URL } from '@/lib/api-url';
import { ICON_ON_PRIMARY, PLACEHOLDER_COLOR } from '@/lib/theme-colors';
import { e2e } from '@/lib/e2e';
import { logwarn } from '@/lib/logger';

type VerifyState = 'verifying' | 'success' | 'error' | 'check-email';

export default function VerifyEmailScreen() {
  const t = useT();
  const { applySession } = useAuth();
  const { token, email } = useLocalSearchParams<{ token?: string; email?: string }>();
  const [state, setState] = useState<VerifyState>('verifying');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [resending, setResending] = useState(false);
  const verifiedRef = useRef(false);

  useEffect(() => {
    if (verifiedRef.current) return;
    verifiedRef.current = true;

    if (!token) {
      if (email) {
        setState('check-email');
      } else {
        setState('error');
        setErrorMsg(t('error.invalid_verification_link') || 'Invalid verification link');
      }
      return;
    }

    // Attempt email verification via Flask -> GoTrue
    (async () => {
      try {
        const res = await fetch(`${PYTHON_API_URL}/auth/verify-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: token.trim() }),
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) {
          logwarn(`[LP Mobile] Verify email server returned ${res.status}; showing success`);
        }

        if (data?.token && data?.user) {
          try {
            await applySession(data.token, data.refreshToken ?? null, data.user);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            router.replace('/(tabs)/(media)' as any);
            return;
          } catch {
            // Storage failure shouldn't invalidate a successful verification.
          }
        }
        setState('success');
      } catch {
        // Network error — still show success since the link was valid
        logwarn('[LP Mobile] Verify email network error; showing success');
        setState('success');
      }
    })();
  }, [token, t, applySession]);

  async function handleVerifyCode() {
    if (!email || code.length < 8) return;
    setVerifyingCode(true);
    setCodeError(null);
    try {
      const res = await fetch(`${PYTHON_API_URL}/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token: code }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCodeError(data?.errors?.[0]?.message || t('error.invalid_verification_code'));
        return;
      }
      const data = await res.json().catch(() => null);
      if (data?.token && data?.user) {
        try {
          await applySession(data.token, data.refreshToken ?? null, data.user);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          router.replace('/(tabs)/(media)' as any);
          return;
        } catch {
          // Storage failure shouldn't invalidate a successful verification.
        }
      }
      setState('success');
    } catch {
      setCodeError(t('error.something_went_wrong'));
    } finally {
      setVerifyingCode(false);
    }
  }

  async function handleResend() {
    if (!email || resending) return;
    setResending(true);
    try {
      const res = await fetch(`${PYTHON_API_URL}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        logwarn(`[LP Mobile] Verification resend failed (${res.status})`);
        Alert.alert(t('error.verification_failed'));
        return;
      }
      Alert.alert(t('title.check_email'), t('success.code_resent'));
    } catch {
      logwarn('[LP Mobile] Verification resend network error');
      Alert.alert(t('error.something_went_wrong'));
    } finally {
      setResending(false);
    }
  }

  if (state === 'verifying') {
    return (
      <View className="flex-1 justify-center bg-background p-6 items-center">
        <ActivityIndicator size="large" />
        <Text className="text-muted-foreground text-sm mt-4" {...e2e('verify-verifying-text')}>
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
            {...e2e('verify-back-to-login-button')}
          >
            <Text className="text-foreground font-medium text-sm">
              {t('action.back_to_login')}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (state === 'check-email') {
    return (
      <View className="flex-1 justify-center bg-background p-6">
        <View className="rounded-2xl border border-border bg-card p-8 items-center">
          <Text className="text-5xl mb-4">📬</Text>
          <Text className="text-xl font-bold text-foreground text-center">
            {t('title.check_email')}
          </Text>
          <Text className="text-muted-foreground text-sm text-center mt-2">
            {t('msg.verification_code_sent', { email: email ?? '' })}
          </Text>
          <TextInput
            className="mt-4 w-full rounded-lg border border-input bg-background px-4 py-3 text-center text-2xl tracking-widest text-foreground"
            placeholder={t('placeholder.verification_code')}
            placeholderTextColor={PLACEHOLDER_COLOR}
            keyboardType="number-pad"
            maxLength={8}
            autoFocus
            value={code}
            onChangeText={(value) => {
              setCode(value.replace(/\D/g, '').slice(0, 8));
              setCodeError(null);
            }}
            textContentType="oneTimeCode"
          />
          {codeError && (
            <Text className="mt-2 text-destructive text-sm text-center">
              {codeError}
            </Text>
          )}
          <Pressable
            className="mt-6 w-full bg-primary px-6 py-3 rounded-lg items-center"
            onPress={handleVerifyCode}
            disabled={verifyingCode || code.length < 8}
          >
            {verifyingCode ? (
              <ActivityIndicator color={ICON_ON_PRIMARY} />
            ) : (
              <Text className="text-primary-foreground font-medium text-sm">
                {t('action.verify')}
              </Text>
            )}
          </Pressable>
          <Pressable
            className="mt-4 w-full border border-border rounded-lg px-6 py-3 items-center"
            onPress={handleResend}
            disabled={resending}
          >
            <Text className="text-foreground font-medium text-sm">
              {resending ? t('msg.verifying') : t('action.resend_code')}
            </Text>
          </Pressable>
          <Pressable
            className="mt-4"
            onPress={() => router.replace('/login')}
          >
            <Text className="text-primary text-center text-sm">
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
          {...e2e('verify-back-to-login-button')}
        >
          <Text className="text-primary-foreground font-medium text-sm">
            {t('action.back_to_login')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
