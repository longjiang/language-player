// @/app/select-l2.tsx
import React, { useState } from "react";
import { StyleSheet, View, Text, TouchableOpacity } from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedScreen } from "@/components/ThemedScreen";
import { router } from "expo-router";

const PricingBlock = ({ price, duration, current, recommended, onPress }) => {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.pricingBlock, current && styles.current, recommended && styles.recommended]}>
      {current && <View style={styles.currentTag}><Text style={styles.tagText}>Current Plan</Text></View>}
      <Text style={styles.price}>{price}</Text>
      <Text style={styles.duration}>{duration}</Text>
      {recommended && <View style={styles.recommendedTag}><Text style={styles.tagText}>Best Value</Text></View>}
    </TouchableOpacity>
  );
};

const GoProScreen = () => {
  const onSelect = (value) => {
    console.log('Selected:', value);
  }

  return (
    <ThemedScreen
      title="Go Pro"
      onBackPress={() => router.back()}
    >
      <Text style={styles.subHeader}>With Pro, you can:</Text>
      <View style={styles.features}>
        <View style={styles.feature}>
          <Icon name="chat" size={24} color="#00aced" />
          <Text style={styles.featureText}>View entire transcripts beyond the first ten lines.</Text>
        </View>
        <View style={styles.feature}>
          <Icon name="search" size={24} color="#00aced" />
          <Text style={styles.featureText}>See all subtitles search results beyond the first three.</Text>
        </View>
        <View style={styles.feature}>
          <Icon name="lightbulb" size={24} color="#00aced" />
          <Text style={styles.featureText}>Use all AI features throughout the app.</Text>
        </View>
      </View>
      <Text style={styles.choosePlan}>Choose Your Plan</Text>
      <PricingBlock
        price="$12/mo"
        duration="Auto-renews each month."
        onPress={() => onSelect('Monthly plan')}
      />
      <PricingBlock
        price="$89/yr"
        duration="Auto renews in 5 months 10 days."
        current
        onPress={() => onSelect('Yearly plan')}
      />
      <PricingBlock
        price="$199/lifetime"
        duration="Never Expires."
        recommended
        onPress={() => onSelect('Lifetime plan')}
      />
      <Text style={styles.footerText}>1. Assuming you will live longer than 2.4 years.</Text>
      <Text style={styles.footerText}>2. All currencies in US dollars (USD).</Text>
    </ThemedScreen>
  );
};

const styles = StyleSheet.create({
  subHeader: {
    fontSize: 18,
    color: '#fff',
    marginBottom: 20,
  },
  features: {
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  featureText: {
    color: '#fff',
    marginLeft: 10,
  },
  choosePlan: {
    fontSize: 20,
    color: '#fff',
    marginBottom: 20,
  },
  pricingBlock: {
    width: '100%',
    padding: 20,
    borderRadius: 10,
    borderColor: '#fff',
    borderWidth: 1,
    marginBottom: 10,
    alignItems: 'center',
  },
  current: {
    borderColor: '#ff6347',
  },
  recommended: {
    borderColor: '#32cd32',
  },
  currentTag: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: '#ff6347',
    padding: 5,
    borderTopLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  recommendedTag: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#32cd32',
    padding: 5,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 10,
  },
  tagText: {
    color: '#fff',
  },
  price: {
    fontSize: 24,
    color: '#fff',
    marginBottom: 10,
  },
  duration: {
    fontSize: 16,
    color: '#fff',
  },
  footerText: {
    color: '#fff',
    marginTop: 10,
  },
});

export default GoProScreen;
