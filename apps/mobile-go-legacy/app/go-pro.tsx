// @/app/go-pro.tsx

import React, { useRef, useState, ReactElement } from "react";
import { useT } from '@/hooks/use-t';
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
import { CancelSubscription } from "@/components/CancelSubscription";
import { goProStyles as styles } from "@/src/styles";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useLanguage } from "@/contexts/LanguageContext";
import Toast from 'react-native-toast-message';

const GoProScreen = () => {
  const [currentMessage, setCurrentMessage] = useState<ReactElement | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const refRBSheet = useRef<ThemedRBSheet>(null);
  const { subscription, subscriptionIsActive, subscriptionWillAutoRenew, cancelSubscription } = useSubscription();
  const t = useT();

  const showMessage = (message: ReactElement) => {
    setCurrentMessage(message);
    if (refRBSheet.current) refRBSheet.current.open();
  };

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
      // Show CancelSubscription component if user has an existing monthly or annual plan
      showMessage(
        <>
          <ThemedText
            type="subtitle"
            style={{ textAlign: "left", marginBottom: 20 }}
          >
            {t('title.current_subscription_active')}
          </ThemedText>
          <ThemedText style={{ textAlign: "left", marginBottom: 26 }}>
            {t('msg.existing_subscription_warning', { planType: t(`subscription.${subscription?.type}`) })}
          </ThemedText>
          <CancelSubscription
            onConfirm={handleCancelSubscription}
            onCancel={() => refRBSheet.current?.close()}
            showTitle={false}
          />
        </>
      );
      return;
    }

    // If no restrictions apply, show the appropriate message
    setSelectedPlan(planType);
    if (Platform.OS === "ios" && planType !== "lifetime") {
      showMessage(<OnlyLifetimePlan />);
    } else {
      showMessage(
        Platform.OS === "ios" 
          ? <IOSPaymentMethods onSuccess={handlePurchaseSuccess} onFailure={handlePurchaseFailure} />
          : <PaymentMethods />
      );
    }
  };

  const handleCancelSubscription = async () => {
    try {
      await cancelSubscription();
      refRBSheet.current?.close();
      Toast.show({
        type: 'success',
        text1: t('title.subscription_cancelled'),
        text2: t('msg.subscription_cancel_success'),
        position: 'top',
        visibilityTime: 4000,
      });
    } catch (error) {
      Toast.show({
        type: 'error',
        text1: t('title.cancellation_failed'),
        text2: t('msg.subscription_cancel_error'),
        position: 'top',
        visibilityTime: 4000,
      });
    }
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
    showMessage(<Failure />);
  };

  const handleRBSheetClose = () => {
    setCurrentMessage(null);
  };

  const currentPlan = subscriptionIsActive(subscription) ? subscription?.type : null;

  const plans = [
    { type: "monthly", price: t('price.monthly', { price: 10 }), duration: t('duration.monthly') },
    { type: "annual", price: t('price.annual', { price: 90 }), duration: t('duration.annual') },
    { type: "lifetime", price: t('price.lifetime', { price: 169 }), duration: t('duration.lifetime'), recommended: true },
  ];

  // Filter plans based on the platform and current subscription
  const filteredPlans = Platform.OS === 'ios'
    ? plans.filter(plan => 
        (plan.type === currentPlan && subscriptionIsActive(subscription)) || 
        plan.type === 'lifetime'
      )
    : plans;

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
        {t('title.choose_your_plan')}
      </ThemedText>
      {filteredPlans.map((plan) => (
        <PricingBlock
          key={plan.type}
          price={plan.price}
          duration={plan.duration}
          current={subscriptionIsActive(subscription) && plan.type === currentPlan}
          recommended={plan.type === 'lifetime'}
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
        {currentMessage}
      </ThemedRBSheet>
      <Toast />
    </ThemedScreen>
  );
};

export default GoProScreen;