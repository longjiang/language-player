import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/hooks/use-t';
import { DIRECTUS_URL } from '@/lib/api-url';
import { ICON_ON_PRIMARY } from '@/lib/theme-colors';

type DeleteState = 'confirm' | 'deleting' | 'success' | 'error';

export default function DeleteAccountScreen() {
  const t = useT();
  const { user, logout } = useAuth();
  const [state, setState] = useState<DeleteState>('confirm');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleDelete = async () => {
    setState('deleting');
    setErrorMsg(null);

    try {
      // Retrieve the auth token from SecureStore
      const SecureStore = require('expo-secure-store');
      const authToken = await SecureStore.getItemAsync('authToken');

      if (!authToken || !user?.id) {
        throw new Error(t('error.login_required') || 'Not authenticated');
      }

      // Try Directus API to delete the user
      const res = await fetch(`${DIRECTUS_URL}/users/${user.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!res.ok) {
        // Directus may not allow self-deletion — show a fallback message
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err?.errors?.[0]?.message ||
            t('error.delete_account_failed') ||
            'Unable to delete account. Please contact support.'
        );
      }

      // Log out and clear local data
      await logout();
      setState('success');
    } catch (e: any) {
      setState('error');
      setErrorMsg(e.message || t('error.delete_account_failed') || 'Failed to delete account');
    }
  };

  if (state === 'success') {
    return (
      <View className="flex-1 justify-center bg-background p-6">
        <View className="rounded-2xl border border-border bg-card p-8 items-center">
          <Text className="text-5xl mb-4">😢</Text>
          <Text className="text-2xl font-bold text-foreground text-center">
            {t('title.delete_account')}
          </Text>
          <Text className="text-muted-foreground text-sm text-center mt-2">
            {t('msg.account_deleted')}
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

  return (
    <View className="flex-1 justify-center bg-background p-6">
      <View className="rounded-2xl border border-border bg-card p-6">
        <Text className="text-2xl font-bold text-foreground text-center mb-4">
          {t('title.delete_account')}
        </Text>

        {state === 'error' && errorMsg && (
          <Text className="text-destructive text-sm mb-4 text-center">{errorMsg}</Text>
        )}

        <Text className="text-muted-foreground text-sm text-center mb-6 leading-5">
          {t('msg.delete_account_confirm')}
        </Text>

        {state === 'deleting' ? (
          <ActivityIndicator color={ICON_ON_PRIMARY} size="large" />
        ) : (
          <>
            <Pressable
              className="bg-destructive py-3 rounded-lg items-center mb-3"
              onPress={handleDelete}
            >
              <Text className="text-destructive-foreground font-bold text-base">
                {t('action.confirm_deletion')}
              </Text>
            </Pressable>

            <Pressable
              className="border border-border py-3 rounded-lg items-center"
              onPress={() => router.back()}
            >
              <Text className="text-foreground font-medium text-sm">
                {t('action.cancel')}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}
