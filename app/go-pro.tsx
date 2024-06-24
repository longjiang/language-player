// @/app/select-l2.tsx
import React, { useRef, useState } from "react";
import { StyleSheet, View, Image } from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedScreen } from "@/components/ThemedScreen";
import { router } from "expo-router";
import { PricingBlock } from "@/components/PricingBlock";
import { ThemedRBSheet } from "@/components/ThemedRBSheet";
import { ThemedButton } from "@/components/ThemedButton";
import { Platform } from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Linking } from 'react-native';

const GoProScreen = () => {
  const [paymentError, setPaymentError] = React.useState(true);
  const [selectedPlan, setSelectedPlan] = React.useState(null);

  const onSelect = (value) => {
    console.log("Selected:", value);
    setSelectedPlan(value);
    refRBSheet.current.open(); // Open the ThemedRBSheet
  };

  const refRBSheet = useRef();

  const semanticWarningColor = useThemeColor({}, "semanticWarning");

  const PaymentMethods = () => (
    <View>
      <ThemedText
        type="subtitle"
        style={{ textAlign: "center", marginBottom: 26 }}
      >
        Choose Your Payment Method
      </ThemedText>
      <ThemedButton
        type="neutral"
        title="Credit Card"
        style={styles.paymentButton}
        leadingIcon={<Icon name="credit-card" />}
        trailingIcon={<Icon name="chevron-right" />}
      />
      <ThemedButton
        type="neutral"
        title="Apple Pay"
        style={styles.paymentButton}
        leadingIcon={<Icon name="apple" />}
        trailingIcon={<Icon name="chevron-right" />}
      />
      <ThemedButton
        type="neutral"
        title="PayPal"
        style={styles.paymentButton}
        leadingIcon={
          <Image source={require("@/assets/images/Name=PayPal.png")} />
        }
        trailingIcon={<Icon name="chevron-right" />}
      />
      <ThemedButton
        type="neutral"
        title="Alipay"
        style={styles.paymentButton}
        leadingIcon={
          <Image source={require("@/assets/images/Name=Alipay.png")} />
        }
        trailingIcon={<Icon name="chevron-right" />}
      />
      <ThemedButton
        type="neutral"
        title="WeChat Pay"
        style={styles.paymentButton}
        leadingIcon={
          <Image source={require("@/assets/images/Name=WeChat Pay.png")} />
        }
        trailingIcon={<Icon name="chevron-right" />}
      />
    </View>
  );

  const IOSPaymentMethods = () => (
    <View>
      { selectedPlan === "lifetime" && (
        <View>
          <ThemedText
            type="subtitle"
            style={{ textAlign: "center", marginBottom: 26 }}
          >
            Confirm Your In-App Purchase
          </ThemedText>
          <ThemedText style={{ textAlign: "left", marginBottom: 26 }}>
            Press "Purchase" and you will be asked to confirm your in-app purchase
            from the Apple App Store.
          </ThemedText>
          <ThemedButton
            type="neutral"
            title="Purchase"
            style={styles.paymentButton}
            leadingIcon={<Icon name="apple" />}
            trailingIcon={<Icon name="chevron-right" />}
          />
        </View>
      )}
      { selectedPlan !== "lifetime" && (
        <View>
          <ThemedText
            type="subtitle"
            style={{ textAlign: "left", marginBottom: 26 }}
          >
            Only the Lifetime plan is available as an option for Apple In-App Purchase.
          </ThemedText>
          <ThemedButton
            type="neutral"
            title="Switch to Lifetime"
            onPress = {() => onSelect("lifetime")}
          />
        </View>
      )}
      
    </View>
  );
  

  const Failure = () => (
    <View>
      <Icon name="alert-outline" size={67} color={semanticWarningColor} style={styles.icon} style={{alignSelf: 'center', marginBottom: 26}} />
      <ThemedText type="subtitle" style={{marginBottom: 26, textAlign: 'center'}}>There was a problem with your payment.</ThemedText>
      <ThemedText style={{marginBottom: 26, textAlign: 'center'}}>
        If you have encountered issues, please contact support.
      </ThemedText>
      <ThemedButton
        type="neutral"
        title="Email Support"
        style={styles.paymentButton}
        leadingIcon={<Icon name="email" />}
        trailingIcon={<Icon name="chevron-right" />}
        onPress={() => {
          const email = "support@example.com"; // Replace with your email address
          const subject = encodeURIComponent("Support Request");
          const body = encodeURIComponent("Please describe your issue or question.");
          const mailtoURL = `mailto:${email}?subject=${subject}&body=${body}`;
          Linking.canOpenURL(mailtoURL)
            .then((supported) => {
              if (supported) {
                Linking.openURL(mailtoURL);
              } else {
                console.log("Don't know how to open this URL: " + mailtoURL);
              }
            })
            .catch((err) => console.error('An error occurred', err));
        }}
      />
    </View>
  );

  return (
    <ThemedScreen title="Go Pro" onBackPress={() => router.back()}>
      <Image
        source={require("@/assets/images/pro-rocket.png")}
        style={{
          width: 59,
          height: 51,
          position: "absolute",
          top: 20,
          right: 20,
        }}
      />

      <ThemedText style={styles.subHeader}>With Pro, you can:</ThemedText>
      <View style={styles.features}>
        <View style={styles.feature}>
          <Image source={require("@/assets/images/go-pro-icon-speech.png")} />
          <ThemedText style={styles.featureText}>
            View entire transcripts beyond the first ten lines.
          </ThemedText>
        </View>
        <View style={styles.feature}>
          <Image source={require("@/assets/images/go-pro-icon-bubble.png")} />
          <ThemedText style={styles.featureText}>
            See all subtitles search results beyond the first three.
          </ThemedText>
        </View>
        <View style={styles.feature}>
          <Image
            source={require("@/assets/images/go-pro-icon-light.png")}
            style={{ marginLeft: 4 }}
          />
          <ThemedText style={styles.featureText}>
            Use all AI features throughout the app.
          </ThemedText>
        </View>
      </View>
      <ThemedText style={styles.choosePlan} type="subtitle">
        Choose Your Plan
      </ThemedText>
      <PricingBlock
        price="$12/mo"
        duration="Auto-renews each month."
        onPress={() => onSelect("monthly")}
      />
      <PricingBlock
        price="$89/yr"
        duration="Auto renews in 5 months 10 days."
        current
        onPress={() => onSelect("annual")}
      />
      <PricingBlock
        price="$199/lifetime"
        duration="Never Expires."
        recommended
        onPress={() => onSelect("lifetime")}
      />
      <ThemedText style={styles.footerText} type="small">
        1. Assuming you will live longer than 2.4 years.
      </ThemedText>
      <ThemedText style={styles.footerText} type="small">
        2. All currencies in US dollars (USD).
      </ThemedText>
      <ThemedRBSheet ref={refRBSheet} height={500}>
        {paymentError ? (
          <Failure />
        ) : Platform.OS === "ios" ? (
          <IOSPaymentMethods />
        ) : (
          <PaymentMethods />
        )}
      </ThemedRBSheet>
    </ThemedScreen>
  );
};

const styles = StyleSheet.create({
  paymentButton: { justifyContent: "space-between", marginBottom: 8 },
  subHeader: {
    fontSize: 18,
    marginBottom: 20,
  },
  features: {
    alignItems: "flex-start",
    marginBottom: 0,
  },
  feature: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    justifyContent: "space-between",
    width: "100%",
  },
  featureText: {
    marginLeft: 10,
    width: 290,
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
