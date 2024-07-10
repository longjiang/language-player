// @/app/account.tsx
import React, { useState, useEffect } from "react";
import { StyleSheet, View, Alert } from "react-native";
import { ThemedButton, ThemedScreen, ThemedText } from "@/components";
import Icon from "react-native-vector-icons/MaterialIcons";
import { router } from "expo-router";
import { PricingBlock } from "@/components/PricingBlock";
import { useThemeColor } from "@/hooks/useThemeColor";
import { User } from "@/src/api/directus/user";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useLanguage } from "@/contexts/LanguageContext";

const AccountScreen = () => {
  const { t } = useLanguage();
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

  const handleLogoutPress = async () => {
    await handleLogout();
    router.navigate("/");
  }

  return (
    <ThemedScreen
      title={t('title.account')}
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
              price={'title.' + subscription.type}
              duration=""  // We'll calculate this inside PricingBlock now
              current
              subscription={subscription}
            />
          ) : (
            <ThemedText style={{ alignSelf: "center", marginTop: 16 }} type="large">
              {t('msg.no_active_subscription')}
            </ThemedText>
          )}
          <ThemedButton
            title={t('title.start_learning')}
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
          {t('msg.loading')}
        </ThemedText>
      )}

      <ThemedButton
        title={t('title.logout')}
        leadingIcon={<Icon name="logout" size={20} />}
        style={styles.button}
        type="ghost"
        onPress={handleLogoutPress}
      />

      <View style={styles.buttonRow}>
        <ThemedButton
          title={t('title.delete_my_account')}
          size="small"
          type="ghost"
          onPress={() => {
            router.navigate("/delete-account");
          }}
          style={{ color: secondaryTextColor }}
        />
        <ThemedButton
          title={t('title.privacy_policy')}
          size="small"
          type="ghost"
          onPress={() => {
            router.navigate("/privacy-policy");
          }}
          style={{ color: secondaryTextColor }}
        />
        <ThemedButton
          title={t('title.test')}
          size="small"
          type="ghost"
          onPress={() => {
            router.navigate("/test/playlist");
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
    paddingHorizontal: 16,
    marginTop: 16,
  },
});

export default AccountScreen;