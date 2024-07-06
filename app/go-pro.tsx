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
import { getPriceTranslation } from '@/utils/translationUtils';

const GoProScreen = () => {
  const [paymentError, setPaymentError] = useState<boolean>(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const refRBSheet = useRef();
  const { subscription, isProUser } = useSubscription();
  const { t } = useLanguage();

  const onSelect = (value: string) => {
    console.log("Selected:", value);
    setSelectedPlan(value);
    if (refRBSheet.current) refRBSheet.current.open();
  };

  const showOnlyLifetimePlan = Platform.OS === "ios" && selectedPlan !== "lifetime";

  const currentPlan = isProUser() ? subscription?.type : null;

  const plans = [
    { type: "monthly", price: t('price.monthly', { price: 12 }), duration: t('duration.monthly') },
    { type: "annual", price: t('price.annual', { price: 89 }), duration: t('duration.annual') },
    { type: "lifetime", price: t('price.lifetime', { price: 199 }), duration: t('duration.lifetime'), recommended: true },
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
        {isProUser() ? t('title.your_current_plan') : t('title.choose_your_plan')}
      </ThemedText>
      {plans.map((plan) => (
        <PricingBlock
          key={plan.type}
          price={plan.price}
          duration={plan.duration}
          current={isProUser() && plan.type === currentPlan}
          recommended={plan.recommended}
          onPress={() => onSelect(plan.type)}
          subscription={isProUser() && plan.type === currentPlan ? subscription : null}
          showUpgrade={false}
        />
      ))}
      <ThemedText style={styles.footerText} type="small">
        {t('footnote.lifetime_assumption')}
      </ThemedText>
      <ThemedText style={styles.footerText} type="small">
        {t('footnote.currency')}
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
