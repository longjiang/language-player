// src/contexts/SubscriptionContext.tsx
import React, { createContext, useContext, useState, useEffect } from "react";
import { Alert } from "react-native";
import * as SecureStore from "expo-secure-store";
import { getUserSubscription } from "@/src/api/directus/subscriptions";
import { GenericCollectionItem } from "@/src/api/directus";
import { useAuth } from "@/contexts/AuthContext";

interface SubscriptionContextProps {
  subscription: GenericCollectionItem | null;
  fetchSubscription: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextProps>({
  subscription: null,
  fetchSubscription: async () => {},
});

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [subscription, setSubscription] = useState<GenericCollectionItem | null>(null);
  const { getStoredUserInfo } = useAuth();

  const fetchSubscription = async () => {
    try {
      const info = await getStoredUserInfo();
      if (info && info.id) {
        const authToken = await SecureStore.getItemAsync("access_token");
        if (!authToken) throw new Error("Failed to retrieve stored auth token");
        const fetchedSubscription = await getUserSubscription(info.id, authToken);
        if (fetchedSubscription) {
          setSubscription(fetchedSubscription);
        }
      }
    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  };

  useEffect(() => {
    fetchSubscription();
  }, []);

  return (
    <SubscriptionContext.Provider value={{ subscription, fetchSubscription }}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => useContext(SubscriptionContext);
