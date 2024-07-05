// @/app/login.tsx

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { ThemedText, ThemedButton, ThemedInput, ThemedScreen } from '@/components';
import { router } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Link } from 'expo-router';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useAuth } from '@/contexts/AuthContext';
import { useUserData } from '@/contexts/UserDataContext';
import { useLanguage } from '@/contexts/LanguageContext';

const LoginScreen = () => {
    const { handleLogin, isAuthenticated, loading } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { userData } = useUserData();
    const { t } = useLanguage();

    useEffect(() => {
        if (isAuthenticated && userData) {
            router.navigate('/account');
        }
    }, [isAuthenticated]);

    const onLoginPress = async () => {
        try {
            await handleLogin(email, password);
        } catch (error: any) {
            Alert.alert('Login Error', error.message);
        }
    };

    return (
        <ThemedScreen
            title={t('title.login')}
            onBackPress={() => router.navigate('/')}
            imageName={require('../assets/images/splash-image.png')}
            imageStyle={{ marginTop: -400 }}
        >
            <ThemedInput
                style={styles.input}
                onChangeText={setEmail}
                value={email}
                placeholder="title.email"
                icon="email"
                keyboardType="email-address"
                autoCapitalize="none"
            />
            <ThemedInput
                style={styles.input}
                onChangeText={setPassword}
                value={password}
                placeholder="title.password"
                secureTextEntry
                icon="lock"
            />

            <ThemedButton title={t('title.login')} onPress={onLoginPress} disabled={loading} />

            <TouchableOpacity style={styles.textButton}>
                <ThemedText>{t('msg.forgot_password')}</ThemedText>
            </TouchableOpacity>

            {/* <ThemedText style={styles.orText}>Or login with:</ThemedText>

            <View style={styles.socialButtons}>
                <ThemedButton type="neutral" size="large" style={styles.socialButton} trailingIcon={<Icon name="google" />} onPress={() => router.navigate('/')} />
                <ThemedButton type="neutral" size="large" style={styles.socialButton} trailingIcon={<Icon name="apple" />} onPress={() => router.navigate('/')} />
                <ThemedButton type="neutral" size="large" style={styles.socialButton} trailingIcon={<Icon name="facebook" />} onPress={() => router.navigate('/')} />
            </View> */}

            <ThemedText style={{ textAlign: 'left', marginTop: 26 }} type="subtitle">{t('msg.dont_have_an_account')} <Link href='/register' style={{ color: useThemeColor({}, 'primaryLink'), fontWeight: 'bold' }}>{t('title.register')}</Link>
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
    orText: {
        textAlign: 'center',
        color: 'white',
        marginTop: 20,
        marginBottom: 10,
    },
    socialButton: {
        marginHorizontal: 4,
        marginBottom: 10,
        flex: 1,
    },
    socialButtons: {
        flexDirection: 'row',
        marginTop: 10,
    }
});

export default LoginScreen;
