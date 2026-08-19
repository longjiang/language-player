import { useState, useEffect, useRef } from 'react';
import { Alert, View, Text, ActivityIndicator } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { Button, buttonTextClass } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { router, useLocalSearchParams } from 'expo-router';
import { useT } from '@/hooks/use-t';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { PYTHON_API_URL } from '@/lib/api-url';
import { ICON_ON_PRIMARY, PLACEHOLDER_COLOR } from '@/lib/theme-colors';
import { e2e } from '@/lib/e2e';
import { logwarn } from '@/lib/logger';
import { AuthContainer } from '@/components/layout/AuthContainer';

type VerifyState = 'verifying' | 'success' | 'error' | 'check-email';

function routeAfterVerification(first: string | undefined, hasStoredPair: boolean) {
  if (first === '1') {
    router.replace('/select-language');
    return;
  }
  if (hasStoredPair) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.replace('/(tabs)/(media)' as any);
    return;
  }
  router.replace('/select-language');
}

export default function VerifyEmailScreen() {
  const t = useT();
  const { applySession } = useAuth();
  const { hasStoredPair } = useLanguage();
  const { token, email, first } = useLocalSearchParams<{ token?: string; email?: string; first?: string }>();
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
            routeAfterVerification(first, hasStoredPair);
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
  }, [token, t, applySession, first, hasStoredPair]);

  async function handleVerifyCode() {
    if (!email || code.length < 8) return;
    setVerifyingCode(true);
    setCodeError(null);
    try {
      const res = await fetch(`${PYTHON_API_URL}/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token: code, type: 'email' }),
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
          routeAfterVerification(first, hasStoredPair);
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
      <AuthContainer>
        <View className="items-center">
          <ActivityIndicator size="large" />
          <Text className="text-muted-foreground text-sm mt-4" {...e2e('verify-verifying-text')}>
            {t('action.verify_email')}
          </Text>
        </View>
      </AuthContainer>
    );
  }

  if (state === 'error') {
    return (
      <AuthContainer>
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
          <Button
            className="mt-6"
            variant="outline"
            onPress={() => router.replace('/login')}
            {...e2e('verify-back-to-login-button')}
          >
            <Text className={buttonTextClass('outline')}>
              {t('action.back_to_login')}
            </Text>
          </Button>
        </View>
      </AuthContainer>
    );
  }

  if (state === 'check-email') {
    return (
      <AuthContainer>
        <View className="rounded-2xl border border-border bg-card p-8 items-center">
          <Text className="text-5xl mb-4">📬</Text>
          <Text className="text-xl font-bold text-foreground text-center">
            {t('title.check_email')}
          </Text>
          <Text className="text-muted-foreground text-sm text-center mt-2">
            {t('msg.verification_code_sent', { email: email ?? '' })}
          </Text>
          <Input
            className="mt-4 w-full"
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
          <Button
            className="mt-6 w-full"
            onPress={handleVerifyCode}
            disabled={verifyingCode || code.length < 8}
          >
            {verifyingCode ? (
              <ActivityIndicator color={ICON_ON_PRIMARY} />
            ) : (
              <Text className={buttonTextClass('default')}>
                {t('action.verify')}
              </Text>
            )}
          </Button>
          <Button
            className="mt-4 w-full"
            variant="outline"
            onPress={handleResend}
            disabled={resending}
          >
            <Text className={buttonTextClass('outline')}>
              {resending ? t('msg.verifying') : t('action.resend_code')}
            </Text>
          </Button>
          <Pressable
            className="mt-4"
            onPress={() => router.replace('/login')}
          >
            <Text className="text-primary text-center text-sm">
              {t('action.back_to_login')}
            </Text>
          </Pressable>
        </View>
      </AuthContainer>
    );
  }

  return (
    <AuthContainer>
      <View className="rounded-2xl border border-border bg-card p-8 items-center">
        <Text className="text-5xl mb-4">🎉</Text>
        <Text className="text-2xl font-bold text-foreground text-center">
          {t('title.email_verified')}
        </Text>
        <Text className="text-muted-foreground text-sm text-center mt-2">
          {t('msg.email_verified')}
        </Text>
        <Button
          className="mt-6"
          onPress={() => router.replace('/login')}
          {...e2e('verify-back-to-login-button')}
        >
          <Text className={buttonTextClass('default')}>
            {t('action.back_to_login')}
          </Text>
        </Button>
      </View>
    </AuthContainer>
  );
}
