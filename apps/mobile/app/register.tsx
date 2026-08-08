import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Keyboard, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { PLACEHOLDER_COLOR, ICON_ON_PRIMARY, ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';
import { useT } from '@/hooks/use-t';
import { localizedError } from '@/lib/errors';
import { e2e } from '@/lib/e2e';
import { AuthContainer } from '@/components/layout/AuthContainer';
import { ACQUISITION_SOURCES } from '@langplayer/shared';
import { PYTHON_API_URL } from '@/lib/api-url';
import { logwarn } from '@/lib/logger';
import { Check, ChevronDown } from 'lucide-react-native';

export default function RegisterScreen() {
  const t = useT();
  const { register } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acquisitionSource, setAcquisitionSource] = useState('');
  const [acquisitionDetails, setAcquisitionDetails] = useState('');
  const [showSources, setShowSources] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedSourceLabel = acquisitionSource
    ? ACQUISITION_SOURCES.find((o) => o.value === acquisitionSource)?.labelKey
    : undefined;

  const handleRegister = async () => {
    Keyboard.dismiss();
    setError(null);

    if (password !== confirmPassword) {
      setError(t('error.passwords_do_not_match'));
      return;
    }
    if (!acquisitionSource) {
      setError(t('msg.please_select_option'));
      return;
    }
    if (acquisitionSource === 'other' && !acquisitionDetails.trim()) {
      setError(t('placeholder.please_specify'));
      return;
    }

    setLoading(true);
    try {
      const user = await register(email.trim(), password, firstName.trim(), lastName.trim());
      if (user?.id) {
        try {
          await fetch(`${PYTHON_API_URL}/acquisition_survey`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: user.id,
              acquisition_source: acquisitionSource,
              acquisition_details:
                acquisitionSource === 'other' ? acquisitionDetails.trim() : undefined,
            }),
          });
        } catch {
          logwarn('[LP Mobile] Failed to submit acquisition survey');
        }
      }
      // Dismiss the register/login modal stack before replacing to a root
      // screen. Replacing a route inside a modal corrupts SafeAreaInsets and
      // makes the header shift down after the auth flow completes.
      router.dismissAll();
      router.replace(`/verify-email?email=${encodeURIComponent(email.trim())}&first=1`);
    } catch (e: any) {
      setError(localizedError(t, e, 'error.registration_failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContainer>
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

      <View className="mb-6">
        <Text className="text-sm font-medium text-foreground mb-1.5">
          {t('title.how_did_you_hear')}
        </Text>
        <Pressable
          onPress={() => setShowSources(!showSources)}
          className="flex-row items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
          {...e2e('register-acquisition-select')}
        >
          <Text
            className={`text-sm flex-1 ${selectedSourceLabel ? 'text-foreground' : 'text-muted-foreground'}`}
            numberOfLines={1}
          >
            {selectedSourceLabel ? t(selectedSourceLabel) : t('title.how_did_you_hear')}
          </Text>
          <ChevronDown size={16} color={ICON_MUTED} />
        </Pressable>

        {showSources && (
          <View className="mt-1 rounded-lg border border-border bg-card overflow-hidden">
            <ScrollView className="max-h-64" bounces={false}>
              {ACQUISITION_SOURCES.map((opt) => {
                const selected = acquisitionSource === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => {
                      setAcquisitionSource(opt.value);
                      setShowSources(false);
                      setError(null);
                    }}
                    className={`flex-row items-center px-4 py-3 border-b border-border ${selected ? 'bg-primary/10' : ''}`}
                    {...e2e(`register-acquisition-option-${opt.value}`)}
                  >
                    <Text className={`text-sm flex-1 ${selected ? 'text-primary font-semibold' : 'text-foreground'}`}>
                      {t(opt.labelKey)}
                    </Text>
                    {selected && <Check size={16} color={ICON_PRIMARY} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {acquisitionSource === 'other' && (
          <TextInput
            className="mt-3 bg-card border border-border rounded-lg px-4 py-3 text-foreground"
            placeholder={t('placeholder.please_specify')}
            placeholderTextColor={PLACEHOLDER_COLOR}
            value={acquisitionDetails}
            onChangeText={(value) => {
              setAcquisitionDetails(value);
              setError(null);
            }}
            {...e2e('register-acquisition-details')}
          />
        )}
      </View>

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
    </AuthContainer>
  );
}
