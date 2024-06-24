// @/components/PricingBlock.tsx

import React, { useRef } from "react";
import { StyleSheet, View, TouchableOpacity, Text } from "react-native";
import { ThemedText, ThemedButton, ThemedView } from "@/components";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { useThemeColor } from "@/hooks/useThemeColor";
import ThemedRBSheet from "./ThemedRBSheet"; // Import the ThemedRBSheet
import { router } from "expo-router";

export const PricingBlock = ({ price, duration, current, recommended, onPress, showButtons }) => {
  const secondaryBrandColor = useThemeColor({}, 'semanticSuccess');
  const secondaryStrokeColor = useThemeColor({}, 'secondaryStroke');
  const primaryTextColor = useThemeColor({}, 'primaryText');
  const primaryBackgroundColor = useThemeColor({}, 'primaryBackground');
  const buttonTextColor = useThemeColor({}, 'buttonText');
  const buttonBackgroundColor = useThemeColor({}, 'buttonBackground');
  const secondaryBackgroundColor = useThemeColor({}, 'secondaryBackground');

  // Ref for the ThemedRBSheet
  const refRBSheet = useRef();

  // Function to handle Cancel button press
  const handleCancelPress = () => {
    refRBSheet.current.open(); // Open the ThemedRBSheet
  };

  return (
    <TouchableOpacity onPress={onPress} style={[styles.pricingBlock, { borderColor: secondaryStrokeColor }, current && {...styles.current, borderColor: primaryTextColor, borderWidth: 5 }, recommended && { borderColor: secondaryBrandColor }]}>
      {current && <View style={[styles.currentTag, { borderColor: primaryTextColor, backgroundColor: primaryTextColor }]}><ThemedText style={{...styles.tagText, color: primaryBackgroundColor}} type="defaultBold">Current Plan</ThemedText></View>}
      <ThemedText style={styles.price} type="title">{price}</ThemedText>
      <ThemedText style={styles.duration} variant="secondary">{duration}</ThemedText>
      {recommended && <View style={[styles.recommendedTag, { backgroundColor: secondaryBrandColor }]}><ThemedText style={styles.tagText}>Best Value</ThemedText></View>}
      {showButtons && (
        <View style={styles.buttonContainer}>
          <ThemedButton
            title="Upgrade"
            size="small"
            trailingIcon={<Icon name="chevron-right" />}
            style={{ marginRight: 8 }}
            onPress={() => router.navigate('/go-pro')}
          />
          <ThemedButton
            title="Cancel"
            size="small"
            type="neutral"
            trailingIcon={<Icon name="chevron-right" />}
            onPress={handleCancelPress}
          />
        </View>
      )}
      <ThemedRBSheet
        ref={refRBSheet}
      >
        <ThemedText style={styles.sheetText} type="subtitle">Are you sure you want to cancel your subscription?</ThemedText>
        <ThemedButton
          title="Keep Subscription"
          type="primary"
          onPress={() => refRBSheet.current.close()}
          style={{
            marginBottom: 10
          }}
        />
        <ThemedButton
          title="Confirm Cancellation"
          type="neutral"
          onPress={() => {
            console.log("Subscription cancelled");
            refRBSheet.current.close();
          }}
        />
      </ThemedRBSheet>
    </TouchableOpacity>
  );
};


const styles = StyleSheet.create({
  sheetText: {
    marginTop: 20,
    marginBottom: 20,
  },
  pricingBlock: {
    width: '100%',
    padding: 20,
    borderRadius: 10,
    borderWidth: 2,
    marginBottom: 10,
    alignItems: 'center',
  },
  current: {

  },
  currentTag: {
    position: 'absolute',
    top: 0,
    left: 0,
    padding: 5,
    borderTopLeftRadius: 5,
    borderBottomRightRadius: 5,
  },
  recommendedTag: {
    position: 'absolute',
    top: 0,
    right: 0,
    padding: 5,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 8,
  },
  tagText: {
    color: 'white',
  },
  price: {
    paddingTop: 0
  },
  duration: {
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    marginTop: 10,
  },
  button: {
    padding: 10,
    borderRadius: 5,
  },
});
