// @/app/verify-email.tsx
import React, { useState } from "react";
import { StyleSheet, Alert } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedCodeInput } from "@/components/ThemedCodeInput";
import { ThemedScreen } from "@/components/ThemedScreen";
import { router, useLocalSearchParams } from "expo-router";
import { login } from "@/src/api/directus/user";
import { sendVerificationEmail, verifyEmailCode } from "@/src/api/python/verify-email";
import * as SecureStore from 'expo-secure-store';
import { useLanguage } from "@/contexts/LanguageContext";
import { Ionicons } from "@expo/vector-icons";

const VerifyEmailScreen = () => {
  const { t } = useLanguage();
  const [code, setCode] = useState("");
  const { email } = useLocalSearchParams();
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    setLoading(true);
    try {
      await verifyEmailCode(email, code);
      const password = await SecureStore.getItemAsync('user_password');
      if (!password) throw new Error(t('error.failed_retrieve_password'));
      await login(email, password);
      await SecureStore.deleteItemAsync('user_password');
      router.push("/acquisition-survey");
      setLoading(false);
    } catch (error: any) {
      Alert.alert(t('error.generic'), error.message);
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    try {
      await sendVerificationEmail(email);
      Alert.alert(t('success.code_resent'));
    } catch (error: any) {
      Alert.alert(t('error.generic'), error.message);
    }
  };

  return (
    <ThemedScreen
      title={t('title.verify_your_email')}
      onBackPress={() => router.navigate("/register")}
      imageName={require("../assets/images/splash-image.png")}
      imageStyle={{ marginTop: -400 }}
    >
      <ThemedText style={styles.instructions}>
        {t('msg.enter_verification_code')} {email}
      </ThemedText>

      <ThemedCodeInput codeLength={6} onCodeFilled={setCode} />

      <ThemedButton
        title={t('action.verify')}
        style={styles.button}
        onPress={handleVerify}
        disabled={code.length < 6 || loading}
      />

      <ThemedButton
        title={t('action.resend_code')}
        style={styles.button}
        onPress={handleResendCode}
        type="ghost"
        leadingIcon={<Ionicons name="refresh" size={24} />}
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
  },
});

export default VerifyEmailScreen;