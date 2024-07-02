// @/app/account.tsx
import React, { useState, useEffect } from "react";
import { StyleSheet, View, Alert } from "react-native";
import { ThemedButton, ThemedScreen, ThemedText } from "@/components";
import Icon from "react-native-vector-icons/MaterialIcons";
import { router } from "expo-router";
import { PricingBlock } from "@/components/PricingBlock";
import { useThemeColor } from "@/hooks/useThemeColor";
import { getStoredUserInfo, logout } from "@/src/api/directus/user";
import { getUserSubscriptions } from "@/src/api/directus";
import * as SecureStore from 'expo-secure-store';
import { getDeltaDate } from "@/src/utils";
import { GenericCollectionItem } from "@/src/api/directus";
import { User } from "@/src/api/directus/user";



const AccountScreen = () => {
  const [userInfo, setUserInfo] = useState<User | null>(null);
  const [subscription, setSubscription] = useState<GenericCollectionItem | null>(null);
  const secondaryTextColor = useThemeColor({}, "secondaryText");

  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const info = await getStoredUserInfo();
        setUserInfo(info);

        if (info && info.id) {
          const authToken = await SecureStore.getItemAsync('access_token');
          if (!authToken) throw new Error('Failed to retrieve stored auth token');
          const subscriptions = await getUserSubscriptions(info.id, authToken);
          if (subscriptions.length > 0) {
            setSubscription(subscriptions[0]);
          }
        }
      } catch (error: any) {
        Alert.alert('Error', error.message);
      }
    };

    fetchUserInfo();
  }, []);

  const handleLogout = async () => {
    await logout();
    router.navigate("/login");
  };

  return (
    <ThemedScreen
      title="Account"
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
            title="Start Learning"
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
        title="Logout"
        leadingIcon={<Icon name="logout" size={20} />}
        style={styles.button}
        type="ghost"
        onPress={handleLogout}
      />

      <View style={styles.buttonRow}>
        <ThemedButton
          title="Delete My Account"
          size="small"
          type="ghost"
          onPress={() => {
            router.navigate("/delete-account");
          }}
          style={{ color: secondaryTextColor }}
        />
        <ThemedButton
          title="Privacy Policy"
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
