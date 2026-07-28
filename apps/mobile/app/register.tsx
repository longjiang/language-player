import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Keyboard } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { PLACEHOLDER_COLOR } from '@/lib/theme-colors';
import { ICON_ON_PRIMARY } from '@/lib/theme-colors';
import { useT } from '@/hooks/use-t';
import { e2e } from '@/lib/e2e';

export default function RegisterScreen() {
  const t = useT();
  const { register } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async () => {
    Keyboard.dismiss();
    setError(null);

    if (password !== confirmPassword) {
      setError(t('error.passwords_do_not_match'));
      return;
    }

    setLoading(true);
    try {
      await register(email.trim(), password, firstName.trim(), lastName.trim());
      router.replace('/select-language');
    } catch (e: any) {
      setError(e.message || t('error.registration_failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 justify-center bg-background p-6">
      <Pressable
        onPress={() => Keyboard.dismiss()}
        {...e2e('dismiss-keyboard')}
      >
        <Text className="text-3xl font-bold text-foreground mb-2 text-center">
          {t('title.create_account')}
        </Text>
        <Text className="text-muted-foreground text-sm text-center mb-8">
          {t('msg.start_learning')}
        </Text>
      </Pressable>

      {error && (
        <Text className="text-destructive text-sm mb-4 text-center">{error}</Text>
      )}

      <View className="flex-row gap-3 mb-3">
        <View className="flex-1">
          <TextInput
            className="bg-card border border-border rounded-lg px-4 py-3 text-foreground"
            placeholder={t('placeholder.first_name')}
            placeholderTextColor={PLACEHOLDER_COLOR}
            value={firstName}
            onChangeText={setFirstName}
            {...e2e('register-firstname-input')}
          />
        </View>
        <View className="flex-1">
          <TextInput
            className="bg-card border border-border rounded-lg px-4 py-3 text-foreground"
            placeholder={t('placeholder.last_name')}
            placeholderTextColor={PLACEHOLDER_COLOR}
            value={lastName}
            onChangeText={setLastName}
            {...e2e('register-lastname-input')}
          />
        </View>
      </View>

      <TextInput
        className="bg-card border border-border rounded-lg px-4 py-3 text-foreground mb-3"
        placeholder={t('placeholder.email')}
        placeholderTextColor={PLACEHOLDER_COLOR}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        {...e2e('register-email-input')}
      />

      <TextInput
        className="bg-card border border-border rounded-lg px-4 py-3 text-foreground mb-3"
        placeholder={t('placeholder.password_min')}
        placeholderTextColor={PLACEHOLDER_COLOR}
        secureTextEntry
        textContentType="none"
        autoComplete="new-password"
        value={password}
        onChangeText={setPassword}
        {...e2e('register-password-input')}
      />

      <TextInput
        className="bg-card border border-border rounded-lg px-4 py-3 text-foreground mb-6"
        placeholder={t('placeholder.confirm_password')}
        placeholderTextColor={PLACEHOLDER_COLOR}
        secureTextEntry
        textContentType="none"
        autoComplete="new-password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        {...e2e('register-confirm-password-input')}
      />

      <Pressable
        className="bg-primary py-3 rounded-lg items-center mb-3"
        onPress={handleRegister}
        disabled={loading}
        {...e2e('register-create-button')}
      >
        {loading ? (
          <ActivityIndicator color={ICON_ON_PRIMARY} />
        ) : (
          <Text className="text-primary-foreground font-bold text-base">
            {t('action.create_account')}
          </Text>
        )}
      </Pressable>

      <Pressable onPress={() => router.back()} {...e2e('register-back-to-login')}>
        <Text className="text-primary text-center text-sm">
          {t('msg.already_have_account')}
        </Text>
      </Pressable>
    </View>
  );
}
