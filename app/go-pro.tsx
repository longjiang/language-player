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
import { useLanguage } from "@/contexts/LanguageContext";
import Toast from 'react-native-toast-message';

const GoProScreen = () => {
  const [paymentError, setPaymentError] = useState<boolean>(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const refRBSheet = useRef<ThemedRBSheet>(null);
  const { subscription, subscriptionIsActive, subscriptionWillAutoRenew } = useSubscription();
  const { t } = useLanguage();

  const handlePricingBlockPress = (planType: string) => {
    if (subscriptionIsActive(subscription) && subscription?.type === planType) {
      // Do nothing if it's the current plan
      return;
    }

    if (subscription?.type === "lifetime") {
      // Do nothing if user has a lifetime subscription
      return;
    }

    if (subscriptionWillAutoRenew(subscription)) {
      // Show message if user has an existing monthly or annual plan
      Toast.show({
        type: 'info',
        text1: t('title.existing_plan'),
        text2: t('msg.cancel_existing_plan_first'),
        position: 'top',
        visibilityTime: 4000,
      });
      return;
    }

    // If no restrictions apply, open the RBSheet
    setSelectedPlan(planType);
    if (refRBSheet.current) refRBSheet.current.open();
  };

  const handlePurchaseSuccess = () => {
    if (refRBSheet.current) refRBSheet.current.close();
    Toast.show({
      type: 'success',
      text1: 'Success',
      text2: 'Your purchase was successful!',
      position: 'top',
      visibilityTime: 4000,
    });
  };

  const handlePurchaseFailure = () => {
    setPaymentError(true);
  };

  const handleRBSheetClose = () => {
    setPaymentError(false);
  };

  const showOnlyLifetimePlan = Platform.OS === "ios" && selectedPlan !== "lifetime";

  const currentPlan = subscriptionIsActive(subscription) ? subscription?.type : null;

  const plans = [
    { type: "monthly", price: t('price.monthly', { price: 10 }), duration: t('duration.monthly') },
    { type: "annual", price: t('price.annual', { price: 90 }), duration: t('duration.annual') },
    { type: "lifetime", price: t('price.lifetime', { price: 169 }), duration: t('duration.lifetime'), recommended: true },
  ];

  return (
    <ThemedScreen title={t('title.go_pro')} onBackPress={() => router.back()}>
      <Image
        source={require("@/assets/images/pro-rocket.png")}
        style={styles.rocketImage}
      />

      <ThemedText style={styles.subHeader}>{t('msg.with_pro_you_can')}</ThemedText>
      <View style={styles.features}>
        {[
          {
            source: require("@/assets/images/go-pro-icon-speech.png"),
            text: t('feature.view_entire_transcripts'),
          },
          {
            source: require("@/assets/images/go-pro-icon-bubble.png"),
            text: t('feature.see_all_subtitles'),
          },
          {
            source: require("@/assets/images/go-pro-icon-light.png"),
            text: t('feature.use_all_ai'),
          },
        ].map((feature, index) => (
          <View style={styles.feature} key={index}>
            <Image source={feature.source} />
            <ThemedText style={styles.featureText}>{feature.text}</ThemedText>
          </View>
        ))}
      </View>
      <ThemedText style={styles.choosePlan} type="subtitle">
        {subscriptionIsActive(subscription) ? t('title.your_current_plan') : t('title.choose_your_plan')}
      </ThemedText>
      {plans.map((plan) => (
        <PricingBlock
          key={plan.type}
          price={plan.price}
          duration={plan.duration}
          current={subscriptionIsActive(subscription) && plan.type === currentPlan}
          recommended={plan.recommended}
          onPress={() => handlePricingBlockPress(plan.type)}
          subscription={subscriptionIsActive(subscription) ? subscription : null}
          showUpgrade={false}
        />
      ))}
      <ThemedText style={styles.footerText} type="small">
        {t('footnote.lifetime_assumption')}
      </ThemedText>
      <ThemedText style={styles.footerText} type="small">
        {t('footnote.currency')}
      </ThemedText>
      <ThemedRBSheet 
        ref={refRBSheet} 
        height={500} 
        closeOnPressMask={true}
        onClose={handleRBSheetClose}
      >
        {paymentError ? (
          <Failure />
        ) : showOnlyLifetimePlan ? (
          <OnlyLifetimePlan />
        ) : Platform.OS === "ios" ? (
          <IOSPaymentMethods onSuccess={handlePurchaseSuccess} onFailure={handlePurchaseFailure} />
        ) : (
          <PaymentMethods />
        )}
      </ThemedRBSheet>
      <Toast />
    </ThemedScreen>
  );
};

export default GoProScreen;