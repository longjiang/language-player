// @/components/IOSPaymentMethods.tsx

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ThemedText } from '@/components/ThemedText';
import { ThemedButton } from '@/components/ThemedButton';
import { inAppPurchaseSuccess } from '@/src/api/python/subscription';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import Toast from 'react-native-toast-message';
import RNIap, {
  initConnection,
  finishTransaction,
  getProducts,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  Product,
  Purchase,
  PurchaseError,
  SubscriptionPurchase,
} from 'react-native-iap';

const IOS_IAP_PRODUCT_ID = 'pro_go';

const showErrorToast = (message: string) => {
  console.error(message);
  Toast.show({
    type: 'error',
    text1: 'Error',
    text2: message,
    position: 'top',
    visibilityTime: 4000,
  });
};

const IOSPaymentMethods = ({ onSuccess, onFailure }) => {
  const [purchaseProcessing, setPurchaseProcessing] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const { userInfo } = useAuth();
  const { subscription, fetchSubscription } = useSubscription();
  const { t } = useLanguage();
  
  if (!userInfo) {
    console.error('IOSPaymentMethods requires user info');
    return null;
  }

  useEffect(() => {
    if (Platform.OS === 'ios') {
      initializeIAP();
      const purchaseUpdateSubscription = purchaseUpdatedListener(
        async (purchase: Purchase | SubscriptionPurchase) => {
          const receipt = purchase.transactionReceipt;
          if (receipt) {
            try {
              await inAppPurchaseSuccess(userInfo.id, receipt);
              await finishTransaction({ purchase, isConsumable: false });
              await fetchSubscription();
              onSuccess(); // Call the success handler
            } catch (error) {
              showErrorToast('Error finishing transaction: ' + error.message);
              onFailure(); // Call the failure handler
            }
          }
        }
      );

      const purchaseErrorSubscription = purchaseErrorListener(
        (error: PurchaseError) => {
          showErrorToast('Purchase error: ' + error.message);
          setPurchaseProcessing(false);
          onFailure(); // Call the failure handler
        }
      );

      return () => {
        if (RNIap) RNIap.endConnection();
        purchaseUpdateSubscription.remove();
        purchaseErrorSubscription.remove();
      };
    }
  }, []);

  const initializeIAP = async () => {
    try {
      await initConnection();
      const products = await getProducts({ skus: [IOS_IAP_PRODUCT_ID] });
      if (products.length > 0) {
        setProduct(products[0]);
      } else {
        showErrorToast(`Product with SKU (${IOS_IAP_PRODUCT_ID}) not found`);
        onFailure(); // Call the failure handler
      }
    } catch (error) {
      showErrorToast('Failed to initialize IAP: ' + error.message);
      onFailure(); // Call the failure handler
    }
  };

  const handlePurchase = async () => {
    if (Platform.OS !== 'ios') return;
    setPurchaseProcessing(true);
    try {
      await requestPurchase({
        sku: IOS_IAP_PRODUCT_ID,
        andDangerouslyFinishTransactionAutomaticallyIOS: false,
      });
    } catch (error) {
      showErrorToast('Purchase error: ' + error.message);
      setPurchaseProcessing(false);
      onFailure(); // Call the failure handler
    }
  };

  if (Platform.OS !== 'ios') {
    return null;
  }

  return (
    <View>
      <ThemedText type="subtitle" style={styles.centeredText}>
        {t('title.confirm_in_app_purchase')}
      </ThemedText>
      <ThemedText style={styles.leftAlignedText}>
        {t('msg.purchase_confirmation')}
      </ThemedText>
      <ThemedButton
        type="neutral"
        title={purchaseProcessing ? t('button.processing') : t('button.purchase')}
        style={styles.paymentButton}
        leadingIcon={<Icon name="apple" />}
        trailingIcon={<Icon name="chevron-right" />}
        onPress={handlePurchase}
        disabled={purchaseProcessing || !product}
      />
      <Toast />
    </View>
  );
};

const styles = StyleSheet.create({
  paymentButton: { justifyContent: 'space-between', marginBottom: 8 },
  centeredText: { textAlign: 'center', marginBottom: 26 },
  leftAlignedText: { textAlign: 'left', marginBottom: 26 },
});

export default IOSPaymentMethods;