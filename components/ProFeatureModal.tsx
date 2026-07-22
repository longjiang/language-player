// @/components/ProFeatureModal.tsx

import React from "react";
import { useT } from '@/hooks/use-t';
import { View, Modal, TouchableOpacity, StyleSheet, Image } from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { proFeatureModalStyles as styles } from "@/src/styles";
import { ThemedText } from "./ThemedText";
import { ThemedButton } from "./ThemedButton";
import { useLanguage } from "@/contexts/LanguageContext";

interface ProFeatureModalProps {
  visible: boolean;
  onClose: () => void;
  upgradeText: string;
}

export const ProFeatureModal: React.FC<ProFeatureModalProps> = ({
  visible,
  onClose,
  upgradeText,
}) => {
  const t = useT();

  const handleUpgrade = () => {
    onClose();
    router.navigate("../");
    router.navigate("/go-pro");
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalBackground}
        activeOpacity={1}
        onPressOut={onClose}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseIcon}>
            <Icon name="close" size={30} style={styles.iconStyle} />
          </TouchableOpacity>
          <Image
            source={require("@/assets/images/pro-rocket.png")}
            style={{
              width: 59,
              height: 51,
              marginBottom: 26,
            }}
          />
          <ThemedText style={styles.modalTitle} type="title">
            {t('title.pro_feature')}
          </ThemedText>
          <ThemedText style={styles.modalText} type="default">
            {upgradeText}
          </ThemedText>
          <ThemedButton 
            title={t('action.upgrade_to_pro')} 
            type="pro" 
            onPress={handleUpgrade} 
            trailingIcon={<Icon name="chevron-right" />} 
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );
};