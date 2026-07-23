import { View, Text, Pressable, Linking } from 'react-native';
import { router } from 'expo-router';
import { AlertTriangle } from 'lucide-react-native';
import { useT } from '@/hooks/use-t';
import { ICON_MUTED } from '@/lib/theme-colors';

/**
 * Top-level error page redirected to by the Python backend after a failed
 * Stripe / PayPal payment. Not under a tab because the Python backend
 * uses a fixed URL: {host}/go-pro-error
 */
export default function GoProErrorPage() {
  const t = useT();

  const handleEmailSupport = () => {
    Linking.openURL('mailto:jon.long@zerotohero.ca');
  };

  return (
    <View className="flex-1 items-center justify-center bg-background px-4 py-16">
      <AlertTriangle size={64} color="#f59e0b" />
      <Text className="mt-4 text-2xl font-bold text-foreground text-center">
        {t('title.payment_issue')}
      </Text>
      <Text className="mt-2 text-muted-foreground text-center">
        {t('msg.payment_issue_desc')}
      </Text>
      <Text className="mt-2 text-sm text-muted-foreground text-center">
        {t('msg.try_again_or_contact')}
      </Text>

      <View className="mt-8 w-full max-w-sm gap-3">
        <Pressable
          className="border border-border rounded-lg py-3 items-center"
          onPress={() => router.back()}
        >
          <Text className="text-foreground font-bold text-base">
            {t('action.try_again')}
          </Text>
        </Pressable>

        <Pressable
          className="bg-primary rounded-lg py-3 items-center"
          onPress={handleEmailSupport}
        >
          <Text className="text-primary-foreground font-bold text-base">
            {t('action.email_support')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
