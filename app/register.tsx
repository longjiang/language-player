import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { ThemedScreen } from '@/components/ThemedScreen';
import { ThemedInput } from '@/components/ThemedInput';
import { ThemedButton } from '@/components/ThemedButton';
import { ThemedText } from '@/components/ThemedText';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Link } from 'expo-router';
import { router } from 'expo-router';

const RegisterScreen = () => {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    return (
        <ThemedScreen
          title="Register"
          onBackPress={() => router.navigate("/")}
          imageName={require("../assets/images/splash-image.png")}
          imageStyle={{ marginTop: -400 }}
        >

            <View style={styles.row}>
                <ThemedInput
                    style={{...styles.input, flex: 1}}
                    onChangeText={setFirstName}
                    value={firstName}
                    placeholder="First"
                />
                <ThemedInput
                    style={{...styles.input, flex: 1}}
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

            <ThemedButton title="Register" onPress={() => { router.push('/verify-email'); }} />

            <ThemedText style={styles.orText}>Or register with:</ThemedText>
            <View style={styles.socialButtons}>
                <ThemedButton type="neutral" size="large" style={styles.socialButton} trailingIcon={<Icon name="google" />} onPress={() => {}} />
                <ThemedButton type="neutral" size="large" style={styles.socialButton} trailingIcon={<Icon name="apple" />} onPress={() => {}} />
                <ThemedButton type="neutral" size="large" style={styles.socialButton} trailingIcon={<Icon name="facebook" />} onPress={() => {}} />
            </View>
            <TouchableOpacity style={styles.textButton}>
                <ThemedText>Already have an account? <Link href='/login' style={{ color: useThemeColor({}, 'primaryLink'), fontWeight: 'bold' }}>Login</Link></ThemedText>
            </TouchableOpacity>
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
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        columnGap: 10,
    },
    // Make sure to adjust or add other styles as necessary
});

export default RegisterScreen;
