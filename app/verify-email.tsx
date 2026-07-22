// @/app/verify-email.tsx

import React, { useState } from "react";
import { useT } from '@/hooks/use-t';
import { StyleSheet, Alert } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedCodeInput } from "@/components/ThemedCodeInput";
import { ThemedScreen } from "@/components/ThemedScreen";
import { router, useLocalSearchParams } from "expo-router";
import { sendVerificationEmail } from "@/src/api/python/verify-email";
import { useLanguage } from "@/contexts/LanguageContext";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";

const VerifyEmailScreen = () => {
  const t = useT();
  const [code, setCode] = useState("");
  const { email } = useLocalSearchParams();
  const [loading, setLoading] = useState(false);
  const { handleVerify } = useAuth();

  const handleVerifyCode = async () => {
    setLoading(true);
    try {
      const token = await handleVerify(email as string, code);
      if (token) {
        setLoading(false);
        router.push("/acquisition-survey");
      }
    } catch (error: any) {
      Alert.alert(t('error.generic'), error.message);
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    try {
      await sendVerificationEmail(email as string);
      Alert.alert(t('success.code_resent'));
    } catch (error: any) {
      Alert.alert(t('error.generic'), error.message);
    }
  };

  return (
    <ThemedScreen
      title={t('title.verify_your_email')}
      onBackPress={() => router.navigate("/register")}
      imageHeight={150}
    >
      <ThemedText style={styles.instructions}>
        {t('msg.enter_verification_code')} {email}
      </ThemedText>

      <ThemedCodeInput codeLength={6} onCodeFilled={setCode} />

      <ThemedButton
        title={t('action.verify')}
        style={styles.button}
        onPress={handleVerifyCode}
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