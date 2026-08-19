import { useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Button } from '@/components/ui/button';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/hooks/use-t';
import { PYTHON_API_URL } from '@/lib/api-url';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { AuthContainer } from '@/components/layout/AuthContainer';
import { ICON_ON_PRIMARY } from '@/lib/theme-colors';
import { e2e } from '@/lib/e2e';

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
      const authToken = await SecureStore.getItemAsync('authToken');

      if (!authToken || !user?.id) {
        throw new Error(t('error.login_required') || 'Not authenticated');
      }

      // Delete account via Flask proxy — user ID is extracted from JWT token server-side.
      // No request body needed; the Authorization header identifies the user.
      const res = await authenticatedFetch(`${PYTHON_API_URL}/auth/delete-account`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
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
      <AuthContainer>
        <View className="rounded-2xl border border-border bg-card p-8 items-center">
          <Text className="text-5xl mb-4">😢</Text>
          <Text className="text-2xl font-bold text-foreground text-center">
            {t('title.delete_account')}
          </Text>
          <Text className="text-muted-foreground text-sm text-center mt-2">
            {t('msg.account_deleted')}
          </Text>
          <Button
            className="mt-6"
            onPress={() => router.replace('/login')}
            {...e2e('delete-account-back-button')}
          >
            <Text className="text-primary-foreground font-medium text-sm">
              {t('action.back_to_login')}
            </Text>
          </Button>
        </View>
      </AuthContainer>
    );
  }

  return (
    <AuthContainer>
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
            <Button
              className="mb-3"
              variant="destructive"
              onPress={handleDelete}
              {...e2e('delete-account-confirm-button')}
            >
              <Text className="text-destructive-foreground font-bold text-base">
                {t('action.confirm_deletion')}
              </Text>
            </Button>

            <Button
              variant="outline"
              onPress={() => router.back()}
              {...e2e('delete-account-cancel-button')}
            >
              <Text className="text-foreground font-medium text-sm">
                {t('action.cancel')}
              </Text>
            </Button>
          </>
        )}
      </View>
    </AuthContainer>
  );
}
