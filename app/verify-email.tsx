// @/app/verify-email.tsx
import React, { useState } from "react";
import { StyleSheet, Alert } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedCodeInput } from "@/components/ThemedCodeInput";
import { ThemedScreen } from "@/components/ThemedScreen";
import { router, useLocalSearchParams } from "expo-router";
import { login } from "@/src/api/directus/login";
import { sendVerificationEmail, verifyEmailCode } from "@/src/api/python/verify-email";
import * as SecureStore from 'expo-secure-store';

const VerifyEmailScreen = () => {
  const [code, setCode] = useState("");
  const { email } = useLocalSearchParams(); // Get email from query params
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    setLoading(true);
    try {
      await verifyEmailCode(email, code); // Add your verification logic here
      const password = await SecureStore.getItemAsync('user_password');
      if (!password) throw new Error('Failed to retrieve stored password');
      await login(email, password); // Log the user in after verification
      await SecureStore.deleteItemAsync('user_password'); // Delete the stored password after use
      router.push("/acquisition-survey");
      setLoading(false);
    } catch (error: any) {
      Alert.alert('Error', error.message);
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    try {
      await sendVerificationEmail(email);
      Alert.alert('Success', 'Verification code resent to your email.');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  return (
    <ThemedScreen
      title="Verify Your Email"
      onBackPress={() => router.navigate("/register")}
      imageName={require("../assets/images/splash-image.png")}
      imageStyle={{ marginTop: -400 }}
    >
      <ThemedText style={styles.instructions}>
        Please enter the verification code sent to the email {email}
      </ThemedText>

      <ThemedCodeInput codeLength={6} onCodeFilled={setCode} />

      <ThemedButton
        title="Verify"
        style={styles.button}
        onPress={handleVerify}
        disabled={code.length < 6 || loading}
      />

      <ThemedButton
        title="Resend Code"
        style={styles.button}
        onPress={handleResendCode}
      />
    </ThemedScreen>
  );
};

const styles = StyleSheet.create({
  instructions: {
    marginBottom: 20,
  },
  button: {
    marginTop: 20,
    marginBottom: 110,
  },
  // Add or adjust other styles as necessary
});

export default VerifyEmailScreen;
