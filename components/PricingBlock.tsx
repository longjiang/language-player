// @/components/PricingBlock.tsx
import React from "react";
import { StyleSheet, View, TouchableOpacity } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";

export const PricingBlock = ({ price, duration, current, recommended, onPress }) => {
  const secondaryBrandColor = useThemeColor({}, 'semanticSuccess');
  const secondaryStrokeColor = useThemeColor({}, 'secondaryStroke');
  const primaryTextColor = useThemeColor({}, 'primaryText');
  const primaryBackgroundColor = useThemeColor({}, 'primaryBackground');

  return (
    <TouchableOpacity onPress={onPress} style={[styles.pricingBlock, { borderColor: secondaryStrokeColor }, current && {...styles.current, borderColor: primaryTextColor, borderWidth: 5 }, recommended && { borderColor: secondaryBrandColor }]}>
      {current && <View style={[styles.currentTag, { borderColor: primaryTextColor, backgroundColor: primaryTextColor }]}><ThemedText style={{...styles.tagText, color: primaryBackgroundColor}} type="defaultBold">Current Plan</ThemedText></View>}
      <ThemedText style={styles.price} type="title">{price}</ThemedText>
      <ThemedText style={styles.duration} variant="secondary">{duration}</ThemedText>
      {recommended && <View style={[styles.recommendedTag, { backgroundColor: secondaryBrandColor }]}><ThemedText style={styles.tagText}>Best Value¹ </ThemedText></View>}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
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
    color: 'white', // Replace with appropriate color using useThemeColor
  },
  price: {
    paddingTop: 0
  },
  duration: {
  },
});