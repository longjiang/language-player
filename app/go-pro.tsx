// @/app/select-l2.tsx
import React, { useRef, useState } from "react";
import { StyleSheet, View, Image, Platform } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedScreen } from "@/components/ThemedScreen";
import { router } from "expo-router";
import { PricingBlock } from "@/components/PricingBlock";
import { ThemedRBSheet } from "@/components/ThemedRBSheet";
import { useThemeColor } from "@/hooks/useThemeColor";
import PaymentMethods from "@/components/PaymentMethods";
import IOSPaymentMethods from "@/components/IOSPaymentMethods";
import Failure from "@/components/Failure";
import { goProStyles as styles } from "@/src/styles";

const GoProScreen = () => {
  const [paymentError, setPaymentError] = useState<boolean>(true);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const refRBSheet = useRef();

  const onSelect = (value: string) => {
    console.log("Selected:", value);
    setSelectedPlan(value);
    if (refRBSheet.current) refRBSheet.current.open();
  };

  return (
    <ThemedScreen title="Go Pro" onBackPress={() => router.back()}>
      <Image
        source={require("@/assets/images/pro-rocket.png")}
        style={styles.rocketImage}
      />

      <ThemedText style={styles.subHeader}>With Pro, you can:</ThemedText>
      <View style={styles.features}>
        {[
          {
            source: require("@/assets/images/go-pro-icon-speech.png"),
            text: "View entire transcripts beyond the first ten lines.",
          },
          {
            source: require("@/assets/images/go-pro-icon-bubble.png"),
            text: "See all subtitles search results beyond the first three.",
          },
          {
            source: require("@/assets/images/go-pro-icon-light.png"),
            text: "Use all AI features throughout the app.",
          },
        ].map((feature, index) => (
          <View style={styles.feature} key={index}>
            <Image source={feature.source} />
            <ThemedText style={styles.featureText}>{feature.text}</ThemedText>
          </View>
        ))}
      </View>
      <ThemedText style={styles.choosePlan} type="subtitle">
        Choose Your Plan
      </ThemedText>
      {[
        { price: "$12/mo", duration: "Auto-renews each month.", plan: "monthly" },
        { price: "$89/yr", duration: "Auto renews in 5 months 10 days.", plan: "annual", current: true },
        { price: "$199/lifetime", duration: "Never Expires.", plan: "lifetime", recommended: true },
      ].map((pricing) => (
        <PricingBlock
          key={pricing.plan}
          price={pricing.price}
          duration={pricing.duration}
          current={pricing.current}
          recommended={pricing.recommended}
          onPress={() => onSelect(pricing.plan)}
        />
      ))}
      <ThemedText style={styles.footerText} type="small">
        1. Assuming you will live longer than 2.4 years.
      </ThemedText>
      <ThemedText style={styles.footerText} type="small">
        2. All currencies in US dollars (USD).
      </ThemedText>
      <ThemedRBSheet ref={refRBSheet} height={500}>
        {paymentError ? <Failure /> : Platform.OS === "ios" ? <IOSPaymentMethods selectedPlan={selectedPlan} onSelect={onSelect} /> : <PaymentMethods />}
      </ThemedRBSheet>
    </ThemedScreen>
  );
};

export default GoProScreen;
