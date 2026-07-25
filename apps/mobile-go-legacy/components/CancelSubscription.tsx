import React from 'react';
import { useT } from '@/hooks/use-t';
import { StyleSheet } from 'react-native';
import { ThemedText, ThemedButton } from "@/components";
import { useLanguage } from "@/contexts/LanguageContext";

interface CancelSubscriptionProps {
  showTitle: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const CancelSubscription: React.FC<CancelSubscriptionProps> = ({
  showTitle,
  onConfirm,
  onCancel
}) => {
  const t = useT();

  return (
    <>
      { showTitle && <ThemedText style={styles.sheetText} type="subtitle">
        {t('msg.confirm_cancel_subscription')}
      </ThemedText>}
      <ThemedButton
        title={t('action.confirm_cancellation')}
        type="primary"
        onPress={onConfirm}
        style={{
          marginBottom: 10,
        }}
      />
      <ThemedButton
        title={t('action.keep_subscription')}
        type="neutral"
        onPress={onCancel}
      />
    </>
  );
};

const styles = StyleSheet.create({
  sheetText: {
    marginTop: 20,
    marginBottom: 20,
  },
});