import React from "react";
import { View, StyleSheet, Linking } from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedButton } from "@/components/ThemedButton";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useLanguage } from "@/contexts/LanguageContext";

const OnlyLifetimePlan = () => {
  const semanticWarningColor = useThemeColor({}, "semanticWarning");
  const { t } = useLanguage();

  return (
    <View style={styles.container}>
      <ThemedText type="subtitle" style={styles.centeredText}>
        {t('title.only_lifetime_available')}
      </ThemedText>
      <ThemedText style={styles.bodyText}>
        {t('msg.subscription_explanation')}
      </ThemedText>
      <ThemedButton
        type="neutral"
        title={t('button.email_support')}
        style={styles.paymentButton}
        leadingIcon={<Icon name="email" />}
        trailingIcon={<Icon name="chevron-right" />}
        onPress={() => {
          const email = "support@example.com";
          const subject = encodeURIComponent(t('email.subject'));
          const body = encodeURIComponent(t('email.body'));
          const mailtoURL = `mailto:${email}?subject=${subject}&body=${body}`;
          Linking.canOpenURL(mailtoURL)
            .then((supported) => {
              if (supported) {
                Linking.openURL(mailtoURL);
              } else {
                console.log(t('error.cannot_open_url') + " " + mailtoURL);
              }
            })
            .catch((err) => console.error(t('error.occurred'), err));
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