import React from "react";
import { View, StyleSheet, Linking } from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedButton } from "@/components/ThemedButton";
import { useThemeColor } from "@/hooks/useThemeColor";

const Failure = () => {
  const semanticWarningColor = useThemeColor({}, "semanticWarning");

  return (
    <View>
      <Icon
        name="alert-outline"
        size={67}
        color={semanticWarningColor}
        style={styles.centeredIcon}
      />
      <ThemedText type="subtitle" style={styles.centeredText}>
        There was a problem with your payment.
      </ThemedText>
      <ThemedText style={styles.centeredText}>
        If you have encountered issues, please contact support.
      </ThemedText>
      <ThemedButton
        type="neutral"
        title="Email Support"
        style={styles.paymentButton}
        leadingIcon={<Icon name="email" />}
        trailingIcon={<Icon name="chevron-right" />}
        onPress={() => {
          const email = "jon.long@zerotohero.ca";
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
  centeredIcon: { alignSelf: "center", marginBottom: 26 },
  centeredText: { textAlign: "center", marginBottom: 26 },
  paymentButton: { justifyContent: "space-between", marginBottom: 8 },
});

export default Failure;
