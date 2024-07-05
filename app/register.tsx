// @/app/RegisterScreen.tsx
import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { ThemedScreen } from '@/components/ThemedScreen';
import { ThemedInput } from '@/components/ThemedInput';
import { ThemedButton } from '@/components/ThemedButton';
import { ThemedText } from '@/components/ThemedText';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Link } from 'expo-router';
import { router } from 'expo-router';
import { registerUser } from '@/src/api/directus/user';
import { sendVerificationEmail } from '@/src/api/python/verify-email';
import { useLanguage } from "@/contexts/LanguageContext"; 
import { registerScreenStyles as styles } from '@/src/styles';

const RegisterScreen = () => {
    const { t } = useLanguage();
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleRegister = async () => {
      if (password !== confirmPassword) {
          Alert.alert('Error', t('error.passwords_do_not_match'));
          return;
      }

      setLoading(true);
      try {
          await registerUser(firstName, lastName, email, password);
          await sendVerificationEmail(email);
          router.push({ pathname: '/verify-email', params: { email } });
      } catch (error) {
          Alert.alert('Error', t('error.registration_failed'));
      } finally {
          setLoading(false);
      }
    };

    return (
        <ThemedScreen
          title={t('title.register')}
          onBackPress={() => router.navigate("/")}
          imageName={require("../assets/images/splash-image.png")}
          imageStyle={{ marginTop: -400 }}
        >
            <View style={styles.row}>
                <ThemedInput
                    style={{...styles.input, flex: 1}}
                    onChangeText={setFirstName}
                    value={firstName}
                    placeholder={t('placeholder.first_name')}
                />
                <ThemedInput
                    style={{...styles.input, flex: 1}}
                    onChangeText={setLastName}
                    value={lastName}
                    placeholder={t('placeholder.last_name')}
                    icon="account"
                />
            </View>
            <ThemedInput
                style={styles.input}
                onChangeText={setEmail}
                value={email}
                placeholder={t('placeholder.email')}
                icon="email"
                keyboardType="email-address"
                autoCapitalize="none"
            />
            <ThemedInput
                style={styles.input}
                onChangeText={setPassword}
                value={password}
                placeholder={t('placeholder.password')}
                secureTextEntry
                icon="lock"
            />
            <ThemedInput
                style={styles.input}
                onChangeText={setConfirmPassword}
                value={confirmPassword}
                placeholder={t('placeholder.confirm_password')}
                secureTextEntry
                icon="lock"
            />

            <ThemedButton title={t('action.register')} onPress={handleRegister} disabled={loading} />

            {/* <ThemedText style={styles.orText}>{t('msg.or_register_with')}</ThemedText>
            <View style={styles.socialButtons}>
                <ThemedButton type="neutral" size="large" style={styles.socialButton} trailingIcon={<Icon name="google" />} onPress={() => {}} />
                <ThemedButton type="neutral" size="large" style={styles.socialButton} trailingIcon={<Icon name="apple" />} onPress={() => {}} />
                <ThemedButton type="neutral" size="large" style={styles.socialButton} trailingIcon={<Icon name="facebook" />} onPress={() => {}} />
            </View> */}
            <TouchableOpacity style={styles.textButton}>
                <ThemedText type="subtitle">{t('msg.already_have_account')} <Link href='/login' style={{ color: useThemeColor({}, 'primaryLink'), fontWeight: 'bold' }}>{t('action.login')}</Link></ThemedText>
            </TouchableOpacity>
        </ThemedScreen>
    );
};

export default RegisterScreen;