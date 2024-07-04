import React from "react";
import { View, StyleSheet, Linking } from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedButton } from "@/components/ThemedButton";
import { useThemeColor } from "@/hooks/useThemeColor";

const OnlyLifetimePlan = () => {
  const semanticWarningColor = useThemeColor({}, "semanticWarning");

  return (
    <View style={styles.container}>
      <ThemedText type="subtitle" style={styles.centeredText}>
        Only the Lifetime Plan is available in the App Store
      </ThemedText>
      <ThemedText style={styles.bodyText}>
        Currently, monthly and annual subscriptions are not supported as in-app
        purchase because our server can only handle one-time payments from
        Apple. To continue the purchase, please choose the Lifetime Plan.
      </ThemedText>
      <ThemedButton
        type="neutral"
        title="Email Support"
        style={styles.paymentButton}
        leadingIcon={<Icon name="email" />}
        trailingIcon={<Icon name="chevron-right" />}
        onPress={() => {
          const email = "support@example.com";
          const subject = encodeURIComponent("Support Request");
          const body = encodeURIComponent(
            "Please describe your issue or question."
          );
          const mailtoURL = `mailto:${email}?subject=${subject}&body=${body}`;
          Linking.canOpenURL(mailtoURL)
            .then((supported) => {
              if (supported) {
                Linking.openURL(mailtoURL);
              } else {
                console.log("Don't know how to open this URL: " + mailtoURL);
              }
            })
            .catch((err) => console.error("An error occurred", err));
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 10,
  },
  centeredText: {
    textAlign: "left",
    marginBottom: 20,
  },
  bodyText: {
    textAlign: "left",
    marginBottom: 26,
  },
  paymentButton: { justifyContent: "space-between", marginBottom: 8 },
});

export default OnlyLifetimePlan;
