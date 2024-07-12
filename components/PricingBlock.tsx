// @/components/PricingBlock.tsx

import React, { useRef } from "react";
import { StyleSheet, View, TouchableOpacity } from "react-native";
import { ThemedText, ThemedButton } from "@/components";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { GenericCollectionItem } from "@/src/api/directus";
import { useThemeColor } from "@/hooks/useThemeColor";
import { ThemedRBSheet } from "./ThemedRBSheet";
import { router } from "expo-router";
import { useLanguage } from "@/contexts/LanguageContext";
import { getDeltaDate } from "@/src/utils";

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
  showCancel = true,
}) => {
  const { t } = useLanguage();
  const secondaryBrandColor = useThemeColor({}, 'semanticSuccess');
  const secondaryStrokeColor = useThemeColor({}, 'secondaryStroke');
  const primaryTextColor = useThemeColor({}, 'primaryText');
  const primaryBackgroundColor = useThemeColor({}, 'primaryBackground');

  const refRBSheet = useRef<ThemedRBSheet>(null);

  const handleCancelPress = () => {
    refRBSheet.current?.open();
  };

  const getExpirationText = () => {
    if (!subscription) return duration;
  
    const days = getDeltaDate(subscription.expires_on);
    if (subscription.type === "lifetime") return t('duration.lifetime');
    return subscription.payment_customer_id
      ? t('msg.auto_renews_in', { days })
      : t('msg.expires_in', { days });
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
              onPress={() => router.navigate('/go-pro')}
            />
          )}
          {shouldShowCancel && (
            <ThemedButton
              title={t('action.cancel')}
              size="small"
              type="neutral"
              style={{ marginLeft: 8 }}
              trailingIcon={<Icon name="chevron-right" />}
              onPress={handleCancelPress}
            />
          )}
        </View>
      )}
      <ThemedRBSheet ref={refRBSheet}>
        <ThemedText style={styles.sheetText} type="subtitle">
          {t('msg.confirm_cancel_subscription')}
        </ThemedText>
        <ThemedButton
          title={t('action.confirm_cancellation')}
          type="primary"
          onPress={() => {
            console.log("Subscription cancelled");
            refRBSheet.current?.close();
          }}
          style={{
            marginBottom: 10,
          }}
        />
        <ThemedButton
          title={t('action.keep_subscription')}
          type="neutral"
          onPress={() => refRBSheet.current?.close()}
        />
      </ThemedRBSheet>
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