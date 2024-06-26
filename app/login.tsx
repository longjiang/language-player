// @/app/LoginScreen.tsx
import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedButton } from '@/components/ThemedButton';
import { ThemedInput } from '@/components/ThemedInput';
import { ThemedScreen } from '@/components/ThemedScreen';
import { router } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Link } from 'expo-router';

import { useThemeColor } from '@/hooks/useThemeColor';

const LoginScreen = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

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
                />
                <ThemedInput
                    style={styles.input}
                    onChangeText={setPassword}
                    value={password}
                    placeholder="Password"
                    secureTextEntry
                    icon="lock"
                />

                <ThemedButton title="Login" />

                <TouchableOpacity style={styles.textButton}>
                    <ThemedText>Forgot Password?</ThemedText>
                </TouchableOpacity>

                <ThemedText style={styles.orText}>Or login with:</ThemedText>

                <View style={styles.socialButtons}>
                    <ThemedButton type="neutral" size="large" style={styles.socialButton} trailingIcon={<Icon name="google"  />} onPress={() => router.navigate("/")} />
                    <ThemedButton type="neutral" size="large" style={styles.socialButton} trailingIcon={<Icon name="apple" />} onPress={() => router.navigate("/")} />
                    <ThemedButton type="neutral" size="large" style={styles.socialButton}  trailingIcon={<Icon name="facebook" />} onPress={() => router.navigate("/")} />
                </View>

                <ThemedText style={{textAlign: 'center', marginTop: 10 }}>Don't have an account? <Link href='/register' style={{ color: useThemeColor({}, 'primaryLink'), fontWeight: 'bold' }}>Register</Link></ThemedText>
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
        flex: 1, // Each button will take equal space
        marginHorizontal: 4, // Add some space between buttons
        marginBottom: 10,
    },
    socialButtons: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 10,
    }
});

export default LoginScreen;