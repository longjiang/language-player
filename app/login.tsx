// @/app/login.tsx

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, Linking } from 'react-native';
import { ThemedText, ThemedButton, ThemedInput, ThemedScreen } from '@/components';
import { router } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Link } from 'expo-router';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useAuth } from '@/contexts/AuthContext';
import { useUserData } from '@/contexts/UserDataContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettings } from '@/contexts/SettingsContext';

const LoginScreen = () => {
    const { handleLogin, isAuthenticated, loading } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { userData } = useUserData();
    const { t } = useLanguage();
    const { settings } = useSettings();

    useEffect(() => {
        if (isAuthenticated && userData) {
            router.navigate('/account');
        }
    }, [isAuthenticated]);

    const translateError = (error: string): string => {
        // Convert error message to a translation key
        const key = `error.${error.toLowerCase().replace(/ /g, '_')}`;
        // Attempt to translate, fall back to original message if no translation found
        return t(key, error);
    };

    const onLoginPress = async () => {
        try {
            const token = await handleLogin(email, password);
            if (token) {
              if (!settings.l1LangCode || !settings.l2LangCode) {
                router.push("/select-l2");
              } else {
                router.push("/(tabs)/(media)");
              }
            }
        } catch (error: any) {
            const errorMessage = translateError(error.message);
            Alert.alert(t('error.login'), errorMessage);
        }
    };

    const handleForgotPassword = async () => {
        const url = 'https://languageplayer.io/forgot-password/';
        const supported = await Linking.canOpenURL(url);

        if (supported) {
            await Linking.openURL(url);
        } else {
            Alert.alert(t('error.general'), t('error.cannot_open_url'));
        }
    };

    return (
        <ThemedScreen
            title={t('title.login')}
            onBackPress={() => router.navigate('/')}
            imageHeight={150}
        >
            <ThemedInput
                style={styles.input}
                onChangeText={setEmail}
                value={email}
                placeholder={t('title.email')}
                icon="email"
                keyboardType="email-address"
                autoCapitalize="none"
            />
            <ThemedInput
                style={styles.input}
                onChangeText={setPassword}
                value={password}
                placeholder={t('title.password')}
                secureTextEntry
                icon="lock"
            />

            <ThemedButton title={t('title.login')} onPress={onLoginPress} disabled={loading} />

            <TouchableOpacity style={styles.textButton} onPress={handleForgotPassword}>
                <ThemedText>{t('msg.forgot_password')}</ThemedText>
            </TouchableOpacity>

            <ThemedText style={{ textAlign: 'left', marginTop: 26 }} type="subtitle">
                {t('msg.dont_have_an_account')} <Link href='/register' style={{ color: useThemeColor({}, 'primaryLink'), fontWeight: 'bold' }}>{t('title.register')}</Link>
            </ThemedText>
        </ThemedScreen>
    );
};

const styles = StyleSheet.create({
    input: {
        marginBottom: 10,
    },
    textButton: {
        marginTop: 10,
        alignSelf: 'flex-start',
    },
});

export default LoginScreen;