// @/app/account.tsx
import React, { useState, useEffect } from "react";
import { StyleSheet, View, Alert } from "react-native";
import { ThemedButton, ThemedScreen, ThemedText } from "@/components";
import Icon from "react-native-vector-icons/MaterialIcons";
import { router } from "expo-router";
import { PricingBlock } from "@/components/PricingBlock";
import { useThemeColor } from "@/hooks/useThemeColor";
import { getDeltaDate } from "@/src/utils";
import { User } from "@/src/api/directus/user";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";

const AccountScreen = () => {
  const [userInfo, setUserInfo] = useState<User | null>(null);
  const secondaryTextColor = useThemeColor({}, "secondaryText");
  const { handleLogout, getStoredUserInfo } = useAuth();
  const { subscription } = useSubscription();

  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const info = await getStoredUserInfo();
        setUserInfo(info);
      } catch (error: any) {
        Alert.alert("Error", error.message);
      }
    };

    fetchUserInfo();
  }, []);

  return (
    <ThemedScreen
      title="title.account"
      imageName={require("../assets/images/splash-image.png")}
      imageStyle={{ marginTop: -400 }}
      onBackPress={() => {
        router.back();
      }}
    >
      {userInfo ? (
        <>
          <ThemedText style={{ alignSelf: "center", marginTop: 16 }} type="xxlarge">
            {userInfo.first_name} {userInfo.last_name}
          </ThemedText>
          <ThemedText
            style={{ alignSelf: "center", marginBottom: 32 + 16 }}
            variant="secondary"
          >
            {userInfo.email}
          </ThemedText>
          {subscription ? (
            <PricingBlock
              price={subscription.type}
              duration={subscription.payment_customer_id ? `Auto renews in ${getDeltaDate(subscription.expires_on)} days` : `Expires in ${getDeltaDate(subscription.expires_on)} days`}
              current
              showCancel={subscription.payment_customer_id}
              showUpgrade={subscription.type !== "lifetime"}
            />
          ) : (
            <ThemedText style={{ alignSelf: "center", marginTop: 16 }} type="large">
              No active subscription found.
            </ThemedText>
          )}
          <ThemedButton
            title="title.start_learning"
            trailingIcon={<Icon name="chevron-right" size={20} />}
            style={{marginTop: 26}}
            type="primary"
            onPress={() => {
              router.navigate("/select-l2");
            }}
          />
        </>
      ) : (
        <ThemedText style={{ alignSelf: "center", marginTop: 16 }} type="xxlarge">
          Loading...
        </ThemedText>
      )}

      <ThemedButton
        title="title.logout"
        leadingIcon={<Icon name="logout" size={20} />}
        style={styles.button}
        type="ghost"
        onPress={handleLogout}
      />

      <View style={styles.buttonRow}>
        <ThemedButton
          title="title.delete_my_account"
          size="small"
          type="ghost"
          onPress={() => {
            router.navigate("/delete-account");
          }}
          style={{ color: secondaryTextColor }}
        />
        <ThemedButton
          title="title.privacy_policy"
          size="small"
          type="ghost"
          onPress={() => {
            router.navigate("/privacy-policy");
          }}
          style={{ color: secondaryTextColor }}
        />
      </View>
    </ThemedScreen>
  );
};

const styles = StyleSheet.create({
  item: {
    padding: 16,
  },
  button: {
    marginTop: 20,
    marginBottom: 50,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16, // Add padding to the sides if needed
    marginTop: 16, // Add top margin to separate from the content above
  },
});

export default AccountScreen;
