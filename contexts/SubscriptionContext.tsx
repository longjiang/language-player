// src/contexts/SubscriptionContext.tsx
import React, { createContext, useContext, useState, useEffect } from "react";
import { Alert } from "react-native";
import * as SecureStore from "expo-secure-store";
import { getUserSubscription } from "@/src/api/directus/subscriptions";
import { GenericCollectionItem } from "@/src/api/directus";
import { useAuth } from "@/contexts/AuthContext";
import { getDeltaDate } from "@/src/utils";

interface SubscriptionContextProps {
  subscription: GenericCollectionItem | null;
  subscriptionIsActive: (subscription: GenericCollectionItem | null) => boolean;
  subscriptionWillAutoRenew: (subscription: GenericCollectionItem | null) => boolean;
  fetchSubscription: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextProps>({
  subscription: null,
  subscriptionIsActive: () => false,
  subscriptionWillAutoRenew: () => false,
  fetchSubscription: async () => {},
});

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [subscription, setSubscription] = useState<GenericCollectionItem | null>(null);
  const { userInfo } = useAuth();

  // subscription {"created_on": "2024-05-23T01:09:37+00:00", "expires_on": "2024-07-31 14:36:09", "id": 3387, "notes": "System failed to update the subscription.", "owner": 986, "payment_customer_id": "", "payment_date": "2024-07-01 14:36:09", "payment_email": "longjiang2005@gmail.com", "payment_id": "200001727281903", "payment_method": null, "payment_processor": null, "status": "draft", "type": "monthly"}

  const fetchSubscription = async () => {
    try {
      if (userInfo && userInfo.id) {
        const authToken = await SecureStore.getItemAsync("authToken");
        if (!authToken) throw new Error("Error fetching subscription. Failed to retrieve stored auth token");
        const fetchedSubscription = await getUserSubscription(userInfo.id, authToken);
        if (fetchedSubscription) {
          setSubscription(fetchedSubscription);
        }
      }
    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  };

  const subscriptionIsActive = (subscription: GenericCollectionItem | null) => {
    if (!subscription) return false;
    if (subscription.type === "lifetime") return true;
    const delta = getDeltaDate(subscription.expires_on);
    return delta > 0;
  };

  const subscriptionWillAutoRenew = (
    subscription: GenericCollectionItem | null
  ) => {
    const willAutoRenew =
      ["monthly", "annual"].includes(subscription?.type) &&
      subscription?.payment_customer_id &&
      subscriptionIsActive(subscription);
    return willAutoRenew;
  };
  
  useEffect(() => {
    if (userInfo) {
      fetchSubscription();
    }
  }, [userInfo]);

  return (
    <SubscriptionContext.Provider value={{ subscription, subscriptionIsActive, subscriptionWillAutoRenew, fetchSubscription }}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => useContext(SubscriptionContext);
