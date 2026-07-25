// @/components/PricingBlock.tsx

import React, { useRef } from "react";
import { useT } from '@/hooks/use-t';
import { StyleSheet, View, TouchableOpacity } from "react-native";
import { ThemedText, ThemedButton } from "@/components";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { GenericCollectionItem } from "@/src/api/directus";
import { useThemeColor } from "@/hooks/useThemeColor";
import { ThemedRBSheet } from "./ThemedRBSheet";
import { useLanguage } from "@/contexts/LanguageContext";
import { getDeltaDate } from "@/src/utils";
import { cancelSubscriptionAtEndOfPeriod } from "@/src/api/python/subscription";
import { CancelSubscription } from "./CancelSubscription";
import { useSubscription } from "@/contexts/SubscriptionContext";
import Toast from 'react-native-toast-message';
import { router } from "expo-router";

export interface PricingBlockProps {
  price: string;
  duration: string;
  current?: boolean;
  recommended?: boolean;
  onPress?: () => void;
  subscription?: GenericCollectionItem | null;
  showUpgrade?: boolean;
  showCancel?: boolean;
}

export const PricingBlock: React.FC<PricingBlockProps> = ({
  price,
  duration,
  current,
  recommended,
  onPress,
  subscription,
  showUpgrade = true,
  showCancel = false,
}) => {
  const t = useT();
  const secondaryBrandColor = useThemeColor({}, 'semanticSuccess');
  const secondaryStrokeColor = useThemeColor({}, 'secondaryStroke');
  const primaryTextColor = useThemeColor({}, 'primaryText');
  const primaryBackgroundColor = useThemeColor({}, 'primaryBackground');
  const { fetchSubscription } = useSubscription();

  const refRBSheet = useRef<ThemedRBSheet>(null);

  const handleCancelPress = () => {
    refRBSheet.current?.open();
  };

  const handleCancelSubscription = async () => {
    if (subscription?.payment_customer_id) {
      try {
        await cancelSubscriptionAtEndOfPeriod(subscription.payment_customer_id);
        await fetchSubscription();
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
    }
    refRBSheet.current?.close();
  };

  const getExpirationText = () => {
    if (!subscription) return duration;
  
    const days = getDeltaDate(subscription.expires_on);
    if (subscription.type === "lifetime") return t('duration.lifetime');
    
    if (subscription.payment_customer_id) {
      if (days > 0) {
        return t('msg.auto_renews_in', { days });
      } else if (days === 0) {
        return t('msg.renews_today');
      } else {
        // Renewal failed case
        return t('msg.renewal_failed_contact_support');
      }
    } else {
      if (days > 0) {
        return t('msg.expires_in', { days });
      } else {
        return t('msg.expired');
      }
    }
  };

  const shouldShowUpgrade = showUpgrade && subscription && subscription.type !== "lifetime";
  const shouldShowCancel = showCancel && subscription && !!subscription.payment_customer_id;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.pricingBlock,
        { borderColor: secondaryStrokeColor },
        recommended && { borderColor: secondaryBrandColor },
        current && { ...styles.current, borderColor: primaryTextColor, borderWidth: 5 },
      ]}
    >
      {current && (
        <View
          style={[
            styles.currentTag,
            { borderColor: primaryTextColor, backgroundColor: primaryTextColor },
          ]}
        >
          <ThemedText style={{ ...styles.tagText, color: primaryBackgroundColor }} type="defaultBold">
            {t('title.current_plan')}
          </ThemedText>
        </View>
      )}
      <ThemedText style={styles.price} type="title">
        {t(price)}
      </ThemedText>
      <ThemedText style={styles.duration} variant="secondary">
        {getExpirationText()}
      </ThemedText>
      {recommended && (
        <View style={[styles.recommendedTag, { backgroundColor: secondaryBrandColor }]}>
          <ThemedText style={styles.tagText}>{t('title.best_value')}¹</ThemedText>
        </View>
      )}
      {(shouldShowUpgrade || shouldShowCancel) && (
        <View style={styles.buttonContainer}>
          {shouldShowUpgrade && (
            <ThemedButton
              title={t('action.upgrade')}
              size="small"
              trailingIcon={<Icon name="chevron-right" />}
              onPress={() => { router.push("/go-pro"); }}
            />
          )}
          {shouldShowCancel && (
            <ThemedButton
              title={t('action.cancel')}
              size="small"
              type="neutral"
              style={{ marginLeft: 8 }}
              onPress={handleCancelPress}
            />
          )}
        </View>
      )}
      <ThemedRBSheet ref={refRBSheet}>
        <CancelSubscription
          onConfirm={handleCancelSubscription}
          onCancel={() => refRBSheet.current?.close()}
        />
      </ThemedRBSheet>
      <Toast />
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
    borderTopRightRadius: 5,
    borderBottomLeftRadius: 5,
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