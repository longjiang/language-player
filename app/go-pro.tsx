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

  const getExpirationText = () => {
    if (!subscription || !isProUser()) return "";
  
    const expiresOn = new Date(subscription.expires_on);
    const now = new Date();
    const diffTime = Math.abs(expiresOn.getTime() - now.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
    const formatTimeRemaining = (days: number) => {
      if (days < 31) {
        return { days: t('time.days', { count: days }) };
      } else {
        const months = Math.floor(days / 30);
        const remainingDays = days % 30;
        return {
          months: t('time.months', { count: months }),
          days: remainingDays > 0 ? t('time.days', { count: remainingDays }) : null
        };
      }
    };
  
    const timeRemaining = formatTimeRemaining(diffDays);
  
    const formattedTime = timeRemaining.days 
      ? timeRemaining.days 
      : t('time.months_and_days', { months: timeRemaining.months, days: timeRemaining.days });
  
    if (subscription.payment_customer_id) {
      return t('msg.auto_renews', { time: formattedTime });
    } else {
      return t('msg.expiring', { time: formattedTime });
    }
  };

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
      {[
        { price: t('price.monthly'), duration: t('duration.monthly'), plan: "monthly" },
        { price: t('price.annual'), duration: t('duration.annual'), plan: "annual" },
        { price: t('price.lifetime'), duration: t('duration.lifetime'), plan: "lifetime", recommended: true },
      ].map((pricing) => (
        <PricingBlock
          key={pricing.plan}
          price={pricing.price}
          duration={isProUser() && pricing.plan === currentPlan ? getExpirationText() : pricing.duration}
          current={isProUser() && pricing.plan === currentPlan}
          recommended={pricing.recommended}
          onPress={() => onSelect(pricing.plan)}
          disabled={isProUser() && pricing.plan === currentPlan}
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