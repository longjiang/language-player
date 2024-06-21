import React, { useState } from "react";
import { StyleSheet } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedCodeInput } from "@/components/ThemedCodeInput";
import { ThemedScreen } from "@/components/ThemedScreen";
import { router } from "expo-router";

const VerifyEmailScreen = () => {
  const [code, setCode] = useState("");

  const handleVerify = () => {
    console.log("Verification code entered:", code);
    // Add your verification logic here
  };

  return (
    <ThemedScreen
      title="Verify Your Email"
      onBackPress={() => router.navigate("/register")}
      imageName={require("../assets/images/splash-image.png")}
      imageStyle={{ top: -230 }}
    >
      <ThemedText style={styles.instructions}>
        Please enter the verification code sent to the email name***@gmail.com
      </ThemedText>

      <ThemedCodeInput codeLength={6} onCodeFilled={setCode} />

      <ThemedButton
        title="Verify"
        style={styles.button}
        onPress={() => {
          router.navigate("/acquisition-survey");
        }}
      />
    </ThemedScreen>
  );
};

const styles = StyleSheet.create({
  image: {
    width: "100%",
    marginBottom: 20,
    position: "relative",
    top: -230,
  },
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
