import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Image, Text } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedButton } from '@/components/ThemedButton';
import { ThemedCodeInput } from '@/components/ThemedCodeInput'; 
import { router } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import splashImage from "../assets/images/splash-image.png";

const VerifyEmailScreen = () => {
    const [code, setCode] = useState('');

    const handleVerify = () => {
        console.log("Verification code entered:", code);
        // Add your verification logic here
    };

    return (
        <ThemedView style={styles.container}>
            <Image source={splashImage} style={styles.image} />
            <View style={styles.contentContainer}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, marginLeft: -15 }}>
                    <ThemedButton type="ghost" size="title" trailingIcon={<Icon name="chevron-left" />} onPress={() => router.navigate("/register")} />
                    <ThemedText type="title" style={{ marginLeft: 10 }}>Verify Your Email</ThemedText>
                </View>

                <ThemedText style={styles.instructions}>
                    Please enter the verification code sent to the email name***@gmail.com
                </ThemedText>

                <ThemedCodeInput
                    codeLength={6}
                    onCodeFilled={setCode}
                />

                <ThemedButton title="Verify" style={styles.button} onPress={ () => { router.navigate("/acquisition-survey"); }} />

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
      paddingBottom: 20,
    },
    contentContainer: {
      flex: 1,
      justifyContent: "flex-end",
      padding: 26,
      textAlign: "left",
      width: "100%", // Ensure this container is full width
    },
    instructions: {
        marginBottom: 20,
    },
    button: {
        marginTop: 20,
        marginBottom: 110
    },
    // Add or adjust other styles as necessary
});

export default VerifyEmailScreen;
