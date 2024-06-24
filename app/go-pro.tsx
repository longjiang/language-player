// @/app/select-l2.tsx
import React from "react";
import { StyleSheet, View, Image } from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedScreen } from "@/components/ThemedScreen";
import { router } from "expo-router";
import { PricingBlock } from "@/components/PricingBlock";

const GoProScreen = () => {
  const onSelect = (value) => {
    console.log('Selected:', value);
  }

  return (
    <ThemedScreen
      title="Go Pro"
      onBackPress={() => router.back()}
    >
      <Image
        source={require('@/assets/images/pro-rocket.png')}
        style={{ width: 59, height: 51, position: 'absolute', top: 20, right: 20 }}
      />
      
      <ThemedText style={styles.subHeader}>With Pro, you can:</ThemedText>
      <View style={styles.features}>
        <View style={styles.feature}>
          <Image
            source={require('@/assets/images/go-pro-icon-speech.png')}
          />
          <ThemedText style={styles.featureText}>View entire transcripts beyond the first ten lines.</ThemedText>
        </View>
        <View style={styles.feature}>
          <Image
            source={require('@/assets/images/go-pro-icon-bubble.png')}
          />
          <ThemedText style={styles.featureText}>See all subtitles search results beyond the first three.</ThemedText>
        </View>
        <View style={styles.feature}>
          <Image
            source={require('@/assets/images/go-pro-icon-light.png')}
            style={{marginLeft: 4}}
          />
          <ThemedText style={styles.featureText}>Use all AI features throughout the app.</ThemedText>
        </View>
      </View>
      <ThemedText style={styles.choosePlan} type="subtitle">Choose Your Plan</ThemedText>
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
      <ThemedText style={styles.footerText} type="small">1. Assuming you will live longer than 2.4 years.</ThemedText>
      <ThemedText style={styles.footerText} type="small">2. All currencies in US dollars (USD).</ThemedText>
    </ThemedScreen>
  );
};

const styles = StyleSheet.create({
  subHeader: {
    fontSize: 18,
    marginBottom: 20,
  },
  features: {
    alignItems: 'flex-start',
    marginBottom: 0,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    justifyContent: 'space-between',
    width: '100%'
  },
  featureText: {
    marginLeft: 10,
    width: 290
  },
  choosePlan: {
    alignSelf: "center",
    marginBottom: 20,
  },
  footerText: {
    marginTop: 10,
  },
});

export default GoProScreen;
