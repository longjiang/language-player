import React from "react";
import { View, StyleSheet } from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedButton } from "@/components/ThemedButton";

const IOSPaymentMethods = ({ selectedPlan, onSelect }) => (
  <View>
    {selectedPlan === "lifetime" ? (
      <View>
        <ThemedText type="subtitle" style={styles.centeredText}>
          Confirm Your In-App Purchase
        </ThemedText>
        <ThemedText style={styles.leftAlignedText}>
          Press "Purchase" and you will be asked to confirm your in-app
          purchase from the Apple App Store.
        </ThemedText>
        <ThemedButton
          type="neutral"
          title="Purchase"
          style={styles.paymentButton}
          leadingIcon={<Icon name="apple" />}
          trailingIcon={<Icon name="chevron-right" />}
        />
      </View>
    ) : (
      <View>
        <ThemedText type="subtitle" style={styles.leftAlignedText}>
          Only the Lifetime plan is available as an option for Apple In-App
          Purchase.
        </ThemedText>
        <ThemedButton
          type="neutral"
          title="Switch to Lifetime"
          onPress={() => onSelect("lifetime")}
        />
      </View>
    )}
  </View>
);

const styles = StyleSheet.create({
  paymentButton: { justifyContent: "space-between", marginBottom: 8 },
  centeredText: { textAlign: "center", marginBottom: 26 },
  leftAlignedText: { textAlign: "left", marginBottom: 26 },
});

export default IOSPaymentMethods;
