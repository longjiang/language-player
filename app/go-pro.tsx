// @/app/go-pro.tsx

import React, { useRef, useState } from "react";
import { StyleSheet, View, Image, Platform } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedScreen } from "@/components/ThemedScreen";
import { router } from "expo-router";
import { PricingBlock } from "@/components/PricingBlock";
import { ThemedRBSheet } from "@/components/ThemedRBSheet";
import PaymentMethods from "@/components/PaymentMethods";
import IOSPaymentMethods from "@/components/IOSPaymentMethods";
import Failure from "@/components/Failure";
import OnlyLifetimePlan from "@/components/OnlyLifetimePlan";
import { goProStyles as styles } from "@/src/styles";
import { useSubscription } from "@/contexts/SubscriptionContext";

const GoProScreen = () => {
  const [paymentError, setPaymentError] = useState<boolean>(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const refRBSheet = useRef();
  const { subscription, isProUser } = useSubscription();

  const onSelect = (value: string) => {
    console.log("Selected:", value);
    setSelectedPlan(value);
    if (refRBSheet.current) refRBSheet.current.open();
  };

  const showOnlyLifetimePlan = Platform.OS === "ios" && selectedPlan !== "lifetime";

  const currentPlan = isProUser() ? subscription?.type : null;

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
        {isProUser() ? "Your Current Plan" : "Choose Your Plan"}
      </ThemedText>
      {[
        { price: "$12/mo", duration: "Auto-renews each month.", plan: "monthly" },
        { price: "$89/yr", duration: "Auto renews annually.", plan: "annual" },
        { price: "$199/lifetime", duration: "Never Expires.", plan: "lifetime", recommended: true },
      ].map((pricing) => (
        <PricingBlock
          key={pricing.plan}
          price={pricing.price}
          duration={pricing.duration}
          current={isProUser() && pricing.plan === currentPlan}
          recommended={pricing.recommended}
          onPress={() => onSelect(pricing.plan)}
          disabled={isProUser() && pricing.plan === currentPlan}
        />
      ))}
      {isProUser() && subscription && (
        <ThemedText style={styles.activeSubscriptionText}>
          Your {currentPlan} subscription is active until {new Date(subscription.expires_on).toLocaleDateString()}
        </ThemedText>
      )}
      <ThemedText style={styles.footerText} type="small">
        1. Assuming you will live longer than 2.4 years.
      </ThemedText>
      <ThemedText style={styles.footerText} type="small">
        2. All currencies in US dollars (USD).
      </ThemedText>
      <ThemedRBSheet ref={refRBSheet} height={500}>
        {paymentError ? (
          <Failure />
        ) : showOnlyLifetimePlan ? (
          <OnlyLifetimePlan />
        ) : Platform.OS === "ios" ? (
          <IOSPaymentMethods selectedPlan={selectedPlan} onSelect={onSelect} />
        ) : (
          <PaymentMethods />
        )}
      </ThemedRBSheet>
    </ThemedScreen>
  );
};

export default GoProScreen;