import React from "react";
import { useT } from '@/hooks/use-t';
import { View, StyleSheet, Linking } from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedButton } from "@/components/ThemedButton";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useLanguage } from "@/contexts/LanguageContext";

const Failure = () => {
  const semanticWarningColor = useThemeColor({}, "semanticWarning");
  const t = useT();

  return (
    <View>
      <Icon
        name="alert-outline"
        size={67}
        color={semanticWarningColor}
        style={styles.centeredIcon}
      />
      <ThemedText type="subtitle" style={styles.centeredText}>
        {t("error.payment_problem")}
      </ThemedText>
      <ThemedText style={styles.centeredText}>
        {t("msg.contact_support")}
      </ThemedText>
      <ThemedButton
        type="neutral"
        title={t("action.email_support")}
        style={styles.paymentButton}
        leadingIcon={<Icon name="email" />}
        trailingIcon={<Icon name="chevron-right" />}
        onPress={() => {
          const email = "jon.long@zerotohero.ca";
          const subject = encodeURIComponent(t("email.support_subject"));
          const body = encodeURIComponent(t("email.support_body"));
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
