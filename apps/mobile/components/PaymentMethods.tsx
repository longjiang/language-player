import React from "react";
import { View, Image, StyleSheet } from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedButton } from "@/components/ThemedButton";

const PaymentMethods = () => (
  <View>
    <ThemedText type="subtitle" style={styles.centeredText}>
      Choose Your Payment Method
    </ThemedText>
    {["Credit Card", "Apple Pay", "PayPal", "Alipay", "WeChat Pay"].map(
      (method) => (
        <ThemedButton
          key={method}
          type="neutral"
          title={method}
          style={styles.paymentButton}
          leadingIcon={
            method === "PayPal" ? (
              <Image source={require("@/assets/images/Name=PayPal.png")} />
            ) : method === "Alipay" ? (
              <Image source={require("@/assets/images/Name=Alipay.png")} />
            ) : method === "WeChat Pay" ? (
              <Image source={require("@/assets/images/Name=WeChat Pay.png")} />
            ) : (
              <Icon name={method.toLowerCase().replace(" ", "-")} />
            )
          }
          trailingIcon={<Icon name="chevron-right" />}
        />
      )
    )}
  </View>
);

const styles = StyleSheet.create({
  paymentButton: { justifyContent: "space-between", marginBottom: 8 },
  centeredText: { textAlign: "center", marginBottom: 26 },
});

export default PaymentMethods;
