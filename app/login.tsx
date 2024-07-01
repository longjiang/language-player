// @/app/LoginScreen.tsx
import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedButton } from '@/components/ThemedButton';
import { ThemedInput } from '@/components/ThemedInput';
import { ThemedScreen } from '@/components/ThemedScreen';
import { router } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Link } from 'expo-router';

import { useThemeColor } from '@/hooks/useThemeColor';
import { login } from '@/src/auth/login';

const LoginScreen = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        setLoading(true);
        try {
            await login(email, password);
            router.navigate("/account");
        } catch (error) {
            Alert.alert('Login Error', error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <ThemedScreen
          title="Login"
          onBackPress={() => router.navigate("/")}
          imageName={require("../assets/images/splash-image.png")}
          imageStyle={{ marginTop: -400 }}
        >
            <ThemedInput
                style={styles.input}
                onChangeText={setEmail}
                value={email}
                placeholder="Email"
                icon="email"
                keyboardType="email-address"
                autoCapitalize="none"
            />
            <ThemedInput
                style={styles.input}
                onChangeText={setPassword}
                value={password}
                placeholder="Password"
                secureTextEntry
                icon="lock"
            />

            <ThemedButton title="Login" onPress={handleLogin} disabled={loading} />

            <TouchableOpacity style={styles.textButton}>
                <ThemedText>Forgot Password?</ThemedText>
            </TouchableOpacity>

            <ThemedText style={styles.orText}>Or login with:</ThemedText>

            <View style={styles.socialButtons}>
                <ThemedButton type="neutral" size="large" style={styles.socialButton} trailingIcon={<Icon name="google" />} onPress={() => router.navigate("/")} />
                <ThemedButton type="neutral" size="large" style={styles.socialButton} trailingIcon={<Icon name="apple" />} onPress={() => router.navigate("/")} />
                <ThemedButton type="neutral" size="large" style={styles.socialButton} trailingIcon={<Icon name="facebook" />} onPress={() => router.navigate("/")} />
            </View>

            <ThemedText style={{ textAlign: 'center', marginTop: 10 }}>
                Don't have an account? <Link href='/register' style={{ color: useThemeColor({}, 'primaryLink'), fontWeight: 'bold' }}>Register</Link>
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
