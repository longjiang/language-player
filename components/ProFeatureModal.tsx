// @/components/ProFeatureModal.tsx

import React from "react";
import { View, Modal, Text, TouchableOpacity } from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { proFeatureModalStyles as styles } from "@/src/styles";

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
  const handleUpgrade = () => {
    onClose();
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
          <TouchableOpacity onPress={onClose}>
            <Icon name="close" size={30} style={styles.modalCloseIcon} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Pro Feature</Text>
          <Text style={styles.modalText}>{upgradeText}</Text>
          <TouchableOpacity
            style={styles.upgradeButton}
            onPress={handleUpgrade}
          >
            <Text style={styles.upgradeButtonText}>Upgrade to Pro</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};
