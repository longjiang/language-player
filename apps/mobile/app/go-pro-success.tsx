import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { router } from 'expo-router';
import { CheckCircle, Loader2, ArrowRight } from 'lucide-react-native';
import { useT } from '@/hooks/use-t';
import { useResponsive } from '@/hooks/use-responsive';
import { useAuth } from '@/contexts/AuthContext';
import { PYTHON_API_URL } from '@/lib/api-url';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { log, logwarn } from '@/lib/logger';

/**
 * Top-level success page shown after a payment completes (IAP in the app,
 * or Stripe/PayPal on the website when the backend redirects here).
 * Not under a tab because the Python backend uses a fixed URL:
 * {host}/go-pro-success
 */
export default function GoProSuccessPage() {
  const { user, loading: authLoading } = useAuth();
  const t = useT();
  const { isSm } = useResponsive();

  const [checking, setChecking] = useState(true);
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    log('[IAP] go-pro-success mounted', {
      authLoading,
      userId: user?.id,
    });
  }, [authLoading, user]);

  useEffect(() => {
    if (authLoading || !user?.id) {
      setChecking(false);
      logwarn('[IAP] go-pro-success: no user/auth yet, showing not-confirmed');
      return;
    }

    let attempts = 0;
    const maxAttempts = 10;

    const check = async () => {
      try {
        const res = await authenticatedFetch(`${PYTHON_API_URL}/user-subscription`);
        if (res.ok) {
          const data = await res.json();
          if (data?.type && data.type !== 'free') {
            setIsPro(true);
            setChecking(false);
            log('[IAP] go-pro-success: confirmed pro');
            return;
          }
        }
      } catch {
        /* retry */
      }

      attempts++;
      if (attempts >= maxAttempts) {
        setChecking(false);
        logwarn('[IAP] go-pro-success: max attempts reached, not confirmed');
        return;
      }
      setTimeout(check, 2000);
    };

    check();
  }, [authLoading, user]);

  if (authLoading || checking) {
    return (
      <View className="flex-1 items-center justify-center bg-background gap-4">
        <Loader2 size={32} className="text-muted-foreground" />
        <Text className="text-sm text-muted-foreground">
          {t('msg.verifying_pro_subscription')}
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center bg-background px-4 py-16">
      <View className="w-full items-center self-center" style={{ maxWidth: 512 }}>
        {isPro ? (
          <>
            <CheckCircle size={64} color="#22c55e" />
            <Text className="mt-4 text-2xl font-bold text-foreground text-center">
              {t('msg.you_are_pro')}
            </Text>
            <Text className="mt-2 text-muted-foreground text-center">
              {t('msg.pro_subscription_active')}
            </Text>
            <View className={`mt-8 w-full max-w-sm gap-3 ${isSm ? 'flex-row' : ''}`}>
              <Pressable
                className={`${isSm ? 'flex-1 ' : ''}border border-border rounded-lg py-3 items-center`}
                onPress={() =>
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  router.replace('/(tabs)' as any)
                }
              >
                <Text className="text-foreground font-bold text-base">
                  {t('action.view_profile')}
                </Text>
              </Pressable>
              <Pressable
                className={`${isSm ? 'flex-1 ' : ''}bg-primary rounded-lg py-3 items-center flex-row justify-center`}
                onPress={() =>
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  router.replace('/(tabs)' as any)
                }
              >
                <Text className="text-primary-foreground font-bold text-base">
                  {t('action.start_watching')}
                </Text>
                <ArrowRight size={16} color="#fff" style={{ marginLeft: 4 }} />
              </Pressable>
            </View>
          </>
        ) : user ? (
          <>
            <Text className="text-2xl font-bold text-foreground text-center">
              {t('msg.subscription_not_confirmed')}
            </Text>
            <Text className="mt-2 text-muted-foreground text-center">
              {t('msg.payment_may_take_longer')}
            </Text>
            <Text className="mt-4 text-sm text-muted-foreground text-center">
              {t('msg.contact_support_if_delayed')}
            </Text>
            <View className="mt-8 w-full max-w-sm">
              <Pressable
                className="border border-border rounded-lg py-3 items-center"
                onPress={() =>
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  router.replace('/(tabs)' as any)
                }
              >
                <Text className="text-foreground font-bold text-base">
                  {t('action.continue')}
                </Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text className="text-2xl font-bold text-foreground text-center">
              {t('msg.subscription_not_confirmed')}
            </Text>
            <Text className="mt-2 text-muted-foreground text-center">
              {t('msg.login_to_verify_pro')}
            </Text>
            <View className="mt-8 w-full max-w-sm">
              <Pressable
                className="bg-primary rounded-lg py-3 items-center"
                onPress={() => router.replace('/login')}
              >
                <Text className="text-primary-foreground font-bold text-base">
                  {t('action.log_in')}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </View>
  );
}
