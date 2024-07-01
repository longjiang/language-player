import React, { useState } from "react";
import { StyleSheet, Alert } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedCodeInput } from "@/components/ThemedCodeInput";
import { ThemedScreen } from "@/components/ThemedScreen";
import { router, useLocalSearchParams } from "expo-router";
import { verifyEmailCode } from "@/src/api/python/verify-email";

const VerifyEmailScreen = () => {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const { email } = useLocalSearchParams<{ email?: string }>(); // Get the email from query params


  const handleVerify = async () => {
    setLoading(true);
    try {
      await verifyEmailCode(email, code);
      router.navigate("/acquisition-survey");
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
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
        Please enter the verification code sent to the email { email }
      </ThemedText>

      <ThemedCodeInput codeLength={6} onCodeFilled={setCode} />

      <ThemedButton
        title="Verify"
        style={styles.button}
        onPress={handleVerify}
        disabled={loading}
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
