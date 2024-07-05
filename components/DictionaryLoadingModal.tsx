// @/components/DictionaryLoadingModal.tsx

import React from 'react';
import { Modal, View, Text, StyleSheet } from 'react-native';
import { dictionaryLoadingModalStyles as styles } from '@/src/styles';
import { useThemeColor } from '@/hooks/useThemeColor';
import { ThemedText } from './ThemedText';
import { useLanguage } from '@/contexts/LanguageContext';

interface DictionaryLoadingModalProps {
  logs: string[];
  l2Code: string;
}

export const DictionaryLoadingModal: React.FC<DictionaryLoadingModalProps> = ({ logs, l2Code }) => {
  const { t } = useLanguage();
  const lastLog = logs.length > 0 ? logs[logs.length - 1] : t('msg.initializing');

  return (
    <Modal
      transparent={true}
      animationType="fade"
      visible={true}
    >
      <View style={styles.overlay}>
        <View style={[styles.modalContainer, {backgroundColor: useThemeColor({}, 'secondaryBackground')} ]}>
          <ThemedText style={styles.loadingText} type="subtitle">
            {t('title.loading_dictionary', { language: t(`lang.${l2Code}`) })}
          </ThemedText>
          <View style={styles.logsContainer}>
            <ThemedText style={styles.logText} type="large" variant="secondary">{lastLog}</ThemedText>
          </View>
        </View>
      </View>
    </Modal>
  );
};