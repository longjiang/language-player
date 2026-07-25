import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { CheckCircle, Loader2, ArrowRight } from 'lucide-react-native';
import { useT } from '@/hooks/use-t';
import { useAuth } from '@/contexts/AuthContext';
import { PYTHON_API_URL } from '@/lib/api-url';

/**
 * Top-level success page redirected to by the Python backend after a
 * successful Stripe / PayPal payment. Not under a tab because the
 * Python backend uses a fixed URL: {host}/go-pro-success
 */
export default function GoProSuccessPage() {
  const { user, loading: authLoading } = useAuth();
  const t = useT();

  const [checking, setChecking] = useState(true);
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    if (authLoading || !user?.id) {
      setChecking(false);
      return;
    }

    const userId = user.id;
    let attempts = 0;
    const maxAttempts = 10;

    const check = async () => {
      try {
        const res = await fetch(
          `${PYTHON_API_URL}/user-subscription?user_id=${userId}`,
        );
        if (res.ok) {
          const data = await res.json();
          if (data?.type && data.type !== 'free') {
            setIsPro(true);
            setChecking(false);
            return;
          }
        }
      } catch {
        /* retry */
      }

      attempts++;
      if (attempts >= maxAttempts) {
        setChecking(false);
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
      {isPro ? (
        <>
          <CheckCircle size={64} color="#22c55e" />
          <Text className="mt-4 text-2xl font-bold text-foreground text-center">
            {t('msg.you_are_pro')}
          </Text>
          <Text className="mt-2 text-muted-foreground text-center">
            {t('msg.pro_subscription_active')}
          </Text>
          <View className="mt-8 w-full max-w-sm gap-3">
            <Pressable
              className="border border-border rounded-lg py-3 items-center"
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
              className="bg-primary rounded-lg py-3 items-center flex-row justify-center"
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
            {t('msg.payment_received')}
          </Text>
          <Text className="mt-2 text-muted-foreground text-center">
            {t('msg.payment_processing')}
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
            Payment successful
          </Text>
          <Text className="mt-2 text-muted-foreground text-center">
            Please log in to verify your Pro status.
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
  );
}
