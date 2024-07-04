// @/components/IOSPaymentMethods.tsx

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ThemedText } from '@/components/ThemedText';
import { ThemedButton } from '@/components/ThemedButton';
import { inAppPurchaseSuccess } from '@/src/api/python/subscription';
import { useAuth } from '@/contexts/AuthContext';
import RNIap, {
  Product,
  PurchaseError,
  SubscriptionPurchase,
  InAppPurchase,
  purchaseErrorListener,
  purchaseUpdatedListener,
} from 'react-native-iap';

const IOS_IAP_PRODUCT_ID = 'pro';

const IOSPaymentMethods = ({ selectedPlan, onSelect }) => {
  const [purchaseProcessing, setPurchaseProcessing] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (Platform.OS === 'ios') {
      initializeIAP();
    }

    return () => {
      if (Platform.OS === 'ios') {
        RNIap.endConnection();
      }
    };
  }, []);

  const initializeIAP = async () => {
    try {
      await RNIap.initConnection();
      const products = await RNIap.getProducts([IOS_IAP_PRODUCT_ID]);
      if (products.length > 0) {
        setProduct(products[0]);
      }
    } catch (error) {
      console.error('Failed to initialize IAP:', error);
    }
  };

  const handlePurchase = async () => {
    if (Platform.OS !== 'ios') return;

    setPurchaseProcessing(true);

    try {
      const purchase = await RNIap.requestPurchase(IOS_IAP_PRODUCT_ID);
      handleCompletedPurchase(purchase);
    } catch (error) {
      console.error('Purchase error:', error);
      setPurchaseProcessing(false);
    }
  };

  const handleCompletedPurchase = async (purchase: InAppPurchase | SubscriptionPurchase) => {
    if (purchase.productId === IOS_IAP_PRODUCT_ID) {
      try {
        const receipt = purchase.transactionReceipt;
        if (receipt) {
          await inAppPurchaseSuccess(user.id, receipt);
          // Navigate to success screen or update UI
          // You might want to use React Navigation or your preferred navigation method here
          // navigation.navigate('GoPro Success');
        }
      } catch (error) {
        console.error('Error processing purchase:', error);
      } finally {
        setPurchaseProcessing(false);
      }
    }
  };

  if (Platform.OS !== 'ios') {
    return null;
  }

  return (
    <View>
      {selectedPlan === 'lifetime' ? (
        <View>
          <ThemedText type="subtitle" style={styles.centeredText}>
            Confirm Your In-App Purchase
          </ThemedText>
          <ThemedText style={styles.leftAlignedText}>
            Press "Purchase" and you will be asked to confirm your in-app
            purchase from the Apple App Store.
          </ThemedText>
          <ThemedButton
            type="neutral"
            title={purchaseProcessing ? 'Processing...' : 'Purchase'}
            style={styles.paymentButton}
            leadingIcon={<Icon name="apple" />}
            trailingIcon={<Icon name="chevron-right" />}
            onPress={handlePurchase}
            disabled={purchaseProcessing || !product}
          />
        </View>
      ) : (
        <View>
          <ThemedText type="subtitle" style={styles.leftAlignedText}>
            Only the Lifetime plan is available as an option for Apple In-App
            Purchase.
          </ThemedText>
          <ThemedButton
            type="neutral"
            title="Switch to Lifetime"
            onPress={() => onSelect('lifetime')}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  paymentButton: { justifyContent: 'space-between', marginBottom: 8 },
  centeredText: { textAlign: 'center', marginBottom: 26 },
  leftAlignedText: { textAlign: 'left', marginBottom: 26 },
});

export default IOSPaymentMethods;