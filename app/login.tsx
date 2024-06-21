// @/app/LoginScreen.tsx
import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedButton } from '@/components/ThemedButton';
import { ThemedInput } from '@/components/ThemedInput';
import { router } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Link } from 'expo-router';

import splashImage from "../assets/images/splash-image.png";
import { useThemeColor } from '@/hooks/useThemeColor';

const LoginScreen = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    return (
        <ThemedView style={styles.container}>
            <Image source={splashImage} style={styles.image} />
            <View style={styles.contentContainer}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, position: 'relative', marginLeft: -15  }}>
                  <ThemedButton type="ghost" size="title" trailingIcon={<Icon name="chevron-left" />} onPress={() => router.navigate("/")} />
                  <ThemedText type="title" style={{ marginLeft: 10 }}>Login</ThemedText>
                </View>

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

                <ThemedButton title="Login" style={styles.button} />

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
            </View>
        </ThemedView>
    );
};

const styles = StyleSheet.create({
    image: {
      width: "100%",
      marginBottom: 20,
      position: 'relative',
      top: -170,
    },
    container: {
      flex: 1,
      backgroundColor: "#000",
      paddingBottom: 20,
    },
    contentContainer: {
      flex: 1,
      justifyContent: "flex-end",
      padding: 26,
      textAlign: "left",
      width: "100%", // Ensure this container is full width
    },
    input: {
        marginBottom: 10,
    },
    textButton: {
        marginTop: 10,
        alignSelf: 'left',
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