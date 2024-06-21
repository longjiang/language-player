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

const RegisterScreen = () => {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    return (
        <ThemedView style={styles.container}>
            <Image source={splashImage} style={styles.image} />
            <View style={styles.contentContainer}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, marginLeft: -15 }}>
                    <ThemedButton type="ghost" size="title" trailingIcon={<Icon name="chevron-left" />} onPress={() => router.navigate("/")} />
                    <ThemedText type="title" style={{ marginLeft: 10 }}>Register</ThemedText>
                </View>

                <View style={styles.row}>
                    <ThemedInput
                        style={[styles.input, styles.flex1]}
                        onChangeText={setFirstName}
                        value={firstName}
                        placeholder="First"
                    />
                    <ThemedInput
                        style={[styles.input, styles.flex1]}
                        onChangeText={setLastName}
                        value={lastName}
                        placeholder="Last"
                        icon="account"
                    />
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
                <ThemedInput
                    style={styles.input}
                    onChangeText={setConfirmPassword}
                    value={confirmPassword}
                    placeholder="Confirm Password"
                    secureTextEntry
                    icon="lock"
                />

                <ThemedButton title="Register" style={styles.button} onPress={() => { router.push('/verify-email'); }} />

                <ThemedText style={styles.orText}>Or register with:</ThemedText>
                <View style={styles.socialButtons}>
                    <ThemedButton type="neutral" size="large" style={styles.socialButton} trailingIcon={<Icon name="google" />} onPress={() => {}} />
                    <ThemedButton type="neutral" size="large" style={styles.socialButton} trailingIcon={<Icon name="apple" />} onPress={() => {}} />
                    <ThemedButton type="neutral" size="large" style={styles.socialButton} trailingIcon={<Icon name="facebook" />} onPress={() => {}} />
                </View>
                <TouchableOpacity style={styles.textButton}>
                    <ThemedText>Already have an account? <Link href='/login' style={{ color: useThemeColor({}, 'primaryLink'), fontWeight: 'bold' }}>Login</Link></ThemedText>
                </TouchableOpacity>
            </View>
        </ThemedView>
    );
};

const styles = StyleSheet.create({
    image: {
      width: "100%",
      marginBottom: 20,
      position: 'relative',
      top: -230,
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
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        columnGap: 10,
    },
    flex1: {
        flex: 1,
    },
    // Make sure to adjust or add other styles as necessary
});

export default RegisterScreen;
